/* Shared-shop backend (Firebase). When config is missing, the app stays on this computer only. */
(function (global) {
  const COLS = ['products', 'categories', 'suppliers', 'sales', 'staff', 'users', 'notifications'];
  const cfg = global.KF_FIREBASE_CONFIG;
  const enabled = !!(
    cfg && cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY' &&
    global.firebase && firebase.apps
  );

  let db = null;
  let auth = null;
  let readyPromise = null;
  let session = null;
  let unsub = [];
  let persistTimers = {};
  let applyingRemote = false;
  let secondary = null;

  function emailFor(code, username) {
    const u = String(username || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const c = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${u}.${c}@kashflow.app`;
  }
  function clean(v) {
    if (v === undefined) return null;
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).forEach((k) => { o[k] = clean(v[k]); });
      return o;
    }
    return v;
  }
  function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function shopRef(id) { return db.collection('shops').doc(id); }
  function itemsCol(shopId, key) { return shopRef(shopId).collection('items').doc(key).collection('rows'); }

  function emitSync(key) {
    document.dispatchEvent(new CustomEvent('kf:sync', { detail: { key } }));
  }

  function stopWatch() {
    unsub.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    unsub = [];
  }

  function watchShop(shopId) {
    stopWatch();
    COLS.forEach((key) => {
      const off = itemsCol(shopId, key).onSnapshot((snap) => {
        const list = snap.docs.map((d) => d.data());
        list.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
        applyingRemote = true;
        KF.hydrate(KF.KEYS[key], list);
        applyingRemote = false;
        emitSync(key);
      }, () => { /* rules / offline */ });
      unsub.push(off);
    });
    const offShop = shopRef(shopId).onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data() || {};
      applyingRemote = true;
      KF.hydrate(KF.KEYS.shopName, data.name || 'KASHFLOW');
      applyingRemote = false;
      if (session) {
        session.shopName = data.name || session.shopName;
        session.shopCode = data.code || session.shopCode;
        session.licensed = data.licensed === true;
        session.trialStartedAt = data.createdAt || data.trialStartedAt || session.trialStartedAt;
        sessionStorage.setItem('kf_session', JSON.stringify(session));
      }
      emitSync('shopName');
    });
    unsub.push(offShop);
  }

  async function persistCollection(key, list) {
    if (!session || !session.shopId) return;
    const col = itemsCol(session.shopId, key);
    const snap = await col.get();
    const rows = (list || []).map((item) => {
      const copy = { ...item };
      if (key === 'users') delete copy.password;
      return clean(copy);
    });
    const want = new Map(rows.map((item) => [String(item.id), item]));
    const batch = db.batch();
    let n = 0;
    snap.docs.forEach((d) => {
      if (!want.has(d.id)) {
        batch.delete(d.ref);
        n++;
      }
    });
    want.forEach((item, id) => {
      batch.set(col.doc(id), item, { merge: true });
      n++;
      if (n >= 400) { /* commit in chunks via extra batches if needed */ }
    });
    await batch.commit();
  }

  function persist(key, value) {
    if (!enabled || applyingRemote || !session) return;
    const name = Object.keys(KF.KEYS).find((k) => KF.KEYS[k] === key);
    if (name === 'shopName') {
      shopRef(session.shopId).update({ name: String(value || 'KASHFLOW') }).catch(() => {});
      return;
    }
    if (!COLS.includes(name)) return;
    clearTimeout(persistTimers[name]);
    persistTimers[name] = setTimeout(() => {
      persistCollection(name, value).catch((err) => console.warn('KASHFLOW sync', err));
    }, 280);
  }

  async function writeMember(shopId, uid, payload) {
    await shopRef(shopId).collection('members').doc(uid).set(payload, { merge: true });
  }

  async function writeAccount(uid, patch) {
    const ref = db.collection('accounts').doc(uid);
    const cur = await ref.get();
    const data = cur.exists ? cur.data() : { shops: [] };
    Object.assign(data, patch);
    await ref.set(data, { merge: true });
  }

  async function uniqueCode() {
    for (let i = 0; i < 12; i++) {
      const code = makeCode();
      const hit = await db.collection('shopIndex').doc(code).get();
      if (!hit.exists) return code;
    }
    return makeCode() + makeCode().slice(0, 2);
  }

  async function provisionAuth(code, username, password) {
    const email = emailFor(code, username);
    if (!secondary) secondary = firebase.initializeApp(cfg, 'kf-provision');
    const cred = await secondary.auth().createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await secondary.auth().signOut();
    return { uid, email };
  }

  async function attachLogin(shopId, code, username, uid, role, email, shopName) {
    const mail = email || emailFor(code, username);
    await shopRef(shopId).collection('logins').doc(username).set({ uid, role, username, email: mail });
    await db.collection('usernames').doc(username).set({
      uid, email: mail, shopId, role, username, code, name: shopName || null,
    }, { merge: true });
  }

  async function assertUsernameFree(username, exceptUid) {
    const hit = await db.collection('usernames').doc(username).get();
    if (hit.exists && hit.data().uid !== exceptUid) {
      throw new Error('That username is already used. Choose another one.');
    }
  }

  async function createShopRecord({ name, username, uid, role }) {
    const code = await uniqueCode();
    const shopId = db.collection('shops').doc().id;
    const now = new Date().toISOString();
    await shopRef(shopId).set({ name, code, ownerUid: uid, createdAt: now, licensed: false });
    await db.collection('shopIndex').doc(code).set({ shopId, name });
    await writeMember(shopId, uid, { uid, username, role, shopId, code, name });
    await attachLogin(shopId, code, username, uid, role, auth.currentUser && auth.currentUser.email, name);
    const accRef = db.collection('accounts').doc(uid);
    const acc = await accRef.get();
    const shops = acc.exists ? (acc.data().shops || []) : [];
    shops.push({ id: shopId, code, name, role });
    await accRef.set({ username, shops, activeShopId: shopId }, { merge: true });
    return { shopId, code, name, role, username, uid };
  }

  async function hydrateSession(user) {
    if (!user) {
      session = null;
      stopWatch();
      return null;
    }
    const accSnap = await db.collection('accounts').doc(user.uid).get();
    const acc = accSnap.exists ? accSnap.data() : { shops: [], username: user.email };
    const shops = acc.shops || [];
    let activeId = acc.activeShopId || (shops[0] && shops[0].id);
    if (activeId && !shops.some((s) => s.id === activeId)) activeId = shops[0] && shops[0].id;
    const current = shops.find((s) => s.id === activeId) || shops[0];
    if (!current) {
      session = null;
      return null;
    }
    let roleTitle = current.role || 'Administrator';
    try {
      const member = await shopRef(current.id).collection('members').doc(user.uid).get();
      if (member.exists && member.data().role) roleTitle = member.data().role;
    } catch (e) { /* rules / offline — keep the role from the account */ }
    let shopData = {};
    try {
      const shopSnap = await shopRef(current.id).get();
      if (shopSnap.exists) shopData = shopSnap.data() || {};
    } catch (e) { /* still allow the session so the dashboard can open */ }
    session = {
      uid: user.uid,
      username: acc.username || current.username,
      role: /^(administrator|admin)$/i.test(String(roleTitle || '')) ? 'admin' : 'cashier',
      roleTitle,
      displayName: acc.username || current.username,
      photo: null,
      staffId: null,
      shopId: current.id,
      shopCode: current.code || shopData.code,
      shopName: current.name || shopData.name,
      licensed: shopData.licensed === true,
      trialStartedAt: shopData.createdAt || shopData.trialStartedAt || null,
      shops,
      loginAt: new Date().toISOString(),
      lastLoginAt: null,
      token: user.uid,
    };
    sessionStorage.setItem('kf_session', JSON.stringify(session));
    sessionStorage.setItem('kf_shop_id', current.id);
    watchShop(current.id);
    return session;
  }

  function boot() {
    if (!enabled) {
      readyPromise = Promise.resolve(false);
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    try { db.enableIndexedDbPersistence({ synchronizeTabs: true }); } catch (e) { /* already on */ }
    readyPromise = new Promise((resolve) => {
      const stop = auth.onAuthStateChanged(async (user) => {
        stop();
        try { await hydrateSession(user); } catch (e) { console.warn(e); session = null; }
        resolve(true);
        auth.onAuthStateChanged(async (next) => {
          if (!next) {
            session = null;
            stopWatch();
          }
        });
      });
    });
  }

  const KFCloud = {
    enabled: () => enabled,
    ready: () => Promise.race([
      readyPromise || Promise.resolve(false),
      new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
    ]),
    session: () => session,
    persist,

    async signIn(username, password) {
      const user = String(username || '').trim().toLowerCase();
      const row = await db.collection('usernames').doc(user).get();
      if (!row.exists || !row.data().email) throw new Error('Invalid username or password.');
      const info = row.data();
      await auth.signInWithEmailAndPassword(info.email, password);
      const uid = auth.currentUser.uid;
      if (info.shopId) {
        const accRef = db.collection('accounts').doc(uid);
        const acc = await accRef.get();
        const shops = acc.exists ? (acc.data().shops || []) : [];
        if (!shops.some((s) => s.id === info.shopId)) {
          shops.push({
            id: info.shopId,
            code: info.code || '',
            name: info.name || '',
            role: info.role || 'Cashier',
            username: user,
          });
        }
        await accRef.set({ username: user, shops, activeShopId: info.shopId }, { merge: true });
      }
      const s = await hydrateSession(auth.currentUser);
      if (!s) throw new Error('This account is not linked to a shop.');
      return s;
    },

    async registerShop({ username, password }) {
      const user = String(username || '').trim().toLowerCase();
      await assertUsernameFree(user);
      const email = `${user}.${Date.now()}@kashflow.app`;
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: user });
      await createShopRecord({
        name: 'KASHFLOW', username: user, uid: cred.user.uid, role: 'Administrator',
      });
      await hydrateSession(cred.user);
      return KFCloud.session();
    },

    async addShop(shopName) {
      if (!session) throw new Error('Sign in first.');
      const info = await createShopRecord({
        name: shopName.trim(),
        username: session.username,
        uid: session.uid,
        role: 'Administrator',
      });
      await KFCloud.switchShop(info.shopId);
      return info;
    },

    async switchShop(shopId) {
      if (!auth.currentUser) throw new Error('Sign in first.');
      await writeAccount(auth.currentUser.uid, { activeShopId: shopId });
      await hydrateSession(auth.currentUser);
      emitSync('*');
      return session;
    },

    async provisionUser(username, password, role) {
      if (!session) throw new Error('Sign in first.');
      const user = String(username).trim().toLowerCase();
      await assertUsernameFree(user);
      const { uid, email } = await provisionAuth(session.shopCode, user, password);
      await attachLogin(session.shopId, session.shopCode, user, uid, role, email, session.shopName);
      await writeMember(session.shopId, uid, {
        uid, username: user, role, shopId: session.shopId, code: session.shopCode, name: session.shopName,
      });
      try {
        await db.collection('accounts').doc(uid).set({
          username: user,
          shops: [{ id: session.shopId, code: session.shopCode, name: session.shopName, role }],
          activeShopId: session.shopId,
        }, { merge: true });
      } catch (err) { /* cashier account is filled on first login */ }
    },

    async activateLicense(extra) {
      if (!session || !session.shopId) throw new Error('Sign in first.');
      const patch = { licensed: true, paidAt: new Date().toISOString() };
      if (extra && extra.paystackRef) patch.paystackRef = extra.paystackRef;
      await shopRef(session.shopId).update(patch);
      session.licensed = true;
      sessionStorage.setItem('kf_session', JSON.stringify(session));
    },

    async signOut() {
      stopWatch();
      session = null;
      if (auth) await auth.signOut();
      sessionStorage.removeItem('kf_session');
      sessionStorage.removeItem('kf_shop_id');
    },
  };

  global.KFCloud = KFCloud;
  boot();
})(window);
