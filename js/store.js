/* KASHFLOW data layer – everything is kept in localStorage for now. */
(function (global) {
  const KEYS = {
    products: 'kf_products',
    categories: 'kf_categories',
    suppliers: 'kf_suppliers',
    sales: 'kf_sales',
    staff: 'kf_staff',
    users: 'kf_users',
    theme: 'kf_theme',
    session: 'kf_session',
    seeded: 'kf_seeded',
    tourDone: 'kf_tour_done',
    zoom: 'kf_zoom',
    notifications: 'kf_notifications',
    lastLogin: 'kf_last_login',
    shopName: 'kf_shop_name',
    trialStarted: 'kf_trial_started',
    licensed: 'kf_licensed',
    authTokens: 'kf_auth_tokens',
    loginLock: 'kf_login_lock',
    demoSalesRemoved: 'kf_demo_sales_removed',
    demoCatalogCleared: 'kf_demo_catalog_cleared',
  };

  const DEMO_PRODUCT_NAMES = [
    'Coca-Cola 500ml', 'Voltic Water 1.5L', 'Malta Guinness', 'Pringles Original',
    'Digestive Biscuits', 'Pepsodent Toothpaste', 'Dettol Soap', 'Omo Detergent 1kg',
    'Dish Sponge (3pk)', 'A4 Paper Ream', 'Bic Pen (Box)', 'USB-C Cable',
    'Nivea Lotion 400ml', 'Pampers Size 3', 'Frozen Chicken 1kg',
  ];
  const DEMO_CATEGORY_NAMES = [
    'Beverages', 'Snacks', 'Toiletries', 'Household', 'Stationery',
    'Electronics', 'Cosmetics', 'Baby Care', 'Frozen Foods',
  ];
  const DEMO_SUPPLIER_NAMES = ['Accra Wholesale Ltd'];

  // Sessions used to live in localStorage, where they never expired. Drop any left over.
  localStorage.removeItem(KEYS.session);

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(KEYS.session));
    } catch (e) {
      return null;
    }
  }
  function newToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const LOW_STOCK_LIMIT = 10;

  // Old versions shipped these logins with public passwords. Any still on those passwords are removed.
  const OLD_DEFAULT_PASSWORDS = { admin: 'admin123', cashier: 'cashier123' };

  // KB.TECH STUDIO support login. It is never stored with the shop's accounts and never shown on
  // User Accounts. Only a PBKDF2-SHA256 hash of its password is kept here.
  const SUPPORT_ACCOUNT = {
    username: 'kbtech.support',
    role: 'Administrator',
    displayName: 'KB.TECH Support',
    support: true,
  };
  const SUPPORT_SECRET = {
    salt: '5c377352d24bd9881c1f2db75df00c6b',
    iterations: 210000,
    hash: '12c3923a9f475f004f8eeaf09ca57e72297d43a31215f222057b92bd063ea236',
  };
  const LICENSE_SECRET = {
    salt: '1abfd34a66df3592e7943148601e9b0a',
    iterations: 210000,
    hash: '0e0a3c54adb365d446452e7b06a4cd52d8b89bdd85120ad5c11ee92cd0f8d031',
  };
  const TRIAL_MS = 48 * 60 * 60 * 1000;

  const hexToBytes = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  const bytesToHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

  const mem = {};
  const CLOUD_KEYS = new Set([
    KEYS.products, KEYS.categories, KEYS.suppliers, KEYS.sales, KEYS.staff,
    KEYS.users, KEYS.notifications, KEYS.shopName,
  ]);
  function cloudOn() {
    return !!(global.KFCloud && KFCloud.enabled() && KFCloud.session());
  }
  function read(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(mem, key)) return mem[key];
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    mem[key] = value;
    if (cloudOn() && CLOUD_KEYS.has(key)) {
      KFCloud.persist(key, value);
      return;
    }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  // ---- Date helpers ----
  function dayKey(date) {
    const d = new Date(date);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function todayKey() { return dayKey(new Date()); }
  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  function money(n) {
    return 'GH₵' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function generateBarcode() {
    return '#PR-' + String(Math.floor(1000 + Math.random() * 9000));
  }

  // Older saved products may be missing the newer fields.
  function migrateProducts() {
    const list = read(KEYS.products, []);
    let changed = false;
    list.forEach((p) => {
      if (!p.barcode) { p.barcode = generateBarcode(); changed = true; }
      if (!p.unit) { p.unit = 'single'; changed = true; }
      if (!p.piecesPerPkt) { p.piecesPerPkt = 1; changed = true; }
      if (p.image === undefined) { p.image = null; changed = true; }
    });
    if (changed) write(KEYS.products, list);

    const cats = read(KEYS.categories, []);
    let catChanged = false;
    cats.forEach((c) => {
      if (c.description === undefined) { c.description = ''; catChanged = true; }
      if (!c.createdAt) { c.createdAt = new Date().toISOString(); catChanged = true; }
    });
    if (catChanged) write(KEYS.categories, cats);

    const sups = read(KEYS.suppliers, []);
    let supChanged = false;
    sups.forEach((s) => {
      if (s.location === undefined) { s.location = ''; supChanged = true; }
      if (s.goods === undefined) { s.goods = ''; supChanged = true; }
      if (s.phone === undefined) { s.phone = ''; supChanged = true; }
      if (!s.createdAt) { s.createdAt = new Date().toISOString(); supChanged = true; }
    });
    if (supChanged) write(KEYS.suppliers, sups);

    // Older versions seeded made-up sales. Every real POS sale has an order number; the demo ones never did.
    if (!read(KEYS.demoSalesRemoved, false)) {
      write(KEYS.sales, read(KEYS.sales, []).filter((s) => s.orderNo));
      write(KEYS.demoSalesRemoved, true);
    }
  }

  // Online shops start empty. Strip the old sample catalog if it is still sitting in this browser.
  function clearDemoCatalog() {
    if (read(KEYS.demoCatalogCleared, false)) { migrateProducts(); return; }

    const products = read(KEYS.products, []).filter((p) => !DEMO_PRODUCT_NAMES.includes(p.name));
    const usedCats = new Set(products.map((p) => Number(p.categoryId)));
    const categories = read(KEYS.categories, []).filter((c) =>
      !DEMO_CATEGORY_NAMES.includes(c.name) || usedCats.has(Number(c.id)));
    const suppliers = read(KEYS.suppliers, []).filter((s) => !DEMO_SUPPLIER_NAMES.includes(s.name));
    write(KEYS.products, products);
    write(KEYS.categories, categories);
    write(KEYS.suppliers, suppliers);
    write(KEYS.sales, read(KEYS.sales, []).filter((s) => s.orderNo));
    write(KEYS.demoSalesRemoved, true);
    write(KEYS.demoCatalogCleared, true);
    migrateProducts();
    KF.syncLowStockNotifications();
  }

  // First run: empty shop. The owner adds their own categories, suppliers and products.
  function seedIfEmpty() {
    if (read(KEYS.seeded, false)) { clearDemoCatalog(); return; }

    write(KEYS.categories, []);
    write(KEYS.suppliers, []);
    write(KEYS.products, []);
    write(KEYS.sales, []);
    write(KEYS.seeded, true);
    write(KEYS.demoSalesRemoved, true);
    write(KEYS.demoCatalogCleared, true);
  }

  const KF = {
    KEYS,
    LOW_STOCK_LIMIT,
    money,
    dayKey,
    todayKey,
    yesterdayKey,
    seedIfEmpty,
    hydrate(key, value) { mem[key] = value; },
    generateBarcode,
    barcodeKey(s) {
      return String(s ?? '').replace(/\s+/g, '').toUpperCase();
    },
    findProductByBarcode(code) {
      const key = KF.barcodeKey(code);
      if (!key) return null;
      return KF.getProducts().find((p) => KF.barcodeKey(p.barcode) === key) || null;
    },

    formatDateTime(iso) {
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      return d.toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      });
    },

    nextId(list) {
      return list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
    },

    stockLabel(p) {
      const qty = Number(p.qty) || 0;
      const per = Number(p.piecesPerPkt) || 1;
      if (p.unit === 'packet' && per > 1) return `${qty} Pkts (${(qty * per).toLocaleString()} Pcs)`;
      return `${qty} Qty`;
    },

    getProducts: () => read(KEYS.products, []),
    saveProducts(list) {
      write(KEYS.products, list);
      KF.syncLowStockNotifications();
    },
    getCategories: () => read(KEYS.categories, []),
    saveCategories: (list) => write(KEYS.categories, list),
    getSuppliers: () => read(KEYS.suppliers, []),
    saveSuppliers: (list) => write(KEYS.suppliers, list),
    getSales: () => read(KEYS.sales, []),
    saveSales: (list) => write(KEYS.sales, list),
    getStaff: () => read(KEYS.staff, []),
    saveStaff(list) {
      write(KEYS.staff, list);
    },
    getUsers() {
      const list = read(KEYS.users, []);
      const kept = list.filter((u) => !(u.builtIn && OLD_DEFAULT_PASSWORDS[u.username] === u.password));
      if (kept.length !== list.length) write(KEYS.users, kept);
      return kept;
    },
    saveUsers(list) {
      write(KEYS.users, list.filter((u) => !u.support));
    },

    needsSetup() {
      if (global.KFCloud && KFCloud.enabled()) return false;
      return !KF.getUsers().some((u) => u.role === 'Administrator');
    },

    SUPPORT_USERNAME: SUPPORT_ACCOUNT.username,
    isReservedUsername: (username) => String(username || '').trim().toLowerCase() === SUPPORT_ACCOUNT.username,

    findAccount(username) {
      if (username === SUPPORT_ACCOUNT.username) return SUPPORT_ACCOUNT;
      return KF.getUsers().find((u) => u.username === username) || null;
    },

    async verifySupportLogin(username, password) {
      if (username !== SUPPORT_ACCOUNT.username || !password) return null;
      if (!global.crypto || !crypto.subtle) return null;
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(SUPPORT_SECRET.salt), iterations: SUPPORT_SECRET.iterations },
        key,
        256,
      );
      const got = bytesToHex(bits);
      let diff = got.length ^ SUPPORT_SECRET.hash.length;
      for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ SUPPORT_SECRET.hash.charCodeAt(i);
      return diff === 0 ? SUPPORT_ACCOUNT : null;
    },

    accessLevel: (role) => {
      const r = String(role || '').toLowerCase();
      return (r === 'administrator' || r === 'admin') ? 'admin' : 'cashier';
    },

    usernameFromName(name) {
      return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    },

    findStaffForAccount(account) {
      if (!account) return null;
      const staff = KF.getStaff();
      if (account.staffId) {
        const byId = staff.find((s) => s.id === Number(account.staffId));
        if (byId) return byId;
      }
      const display = String(account.displayName || '').trim().toLowerCase();
      if (display) {
        const byName = staff.find((s) => (s.name || '').trim().toLowerCase() === display);
        if (byName) return byName;
      }
      const user = String(account.username || '').trim().toLowerCase();
      if (!user) return null;
      const bySlug = staff.filter((s) => KF.usernameFromName(s.name) === user);
      if (bySlug.length === 1) return bySlug[0];
      const byFirst = staff.filter((s) => (s.name || '').trim().toLowerCase().split(/\s+/)[0] === user);
      if (byFirst.length === 1) return byFirst[0];
      return null;
    },

    resolveAccountProfile(account) {
      const staff = KF.findStaffForAccount(account);
      return {
        photo: (staff && staff.photo) || (account && account.photo) || null,
        displayName: (staff && staff.name) || (account && account.displayName) || (account && account.username) || '',
        staffId: (account && account.staffId) || (staff && staff.id) || null,
      };
    },

    syncStaffProfileToUsers(staff) {
      if (!staff) return;
      const users = KF.getUsers();
      let changed = false;
      users.forEach((u) => {
        if (u.staffId !== staff.id) return;
        u.photo = staff.photo || null;
        u.displayName = staff.name;
        changed = true;
      });
      if (changed) KF.saveUsers(users);
      const session = KF.getSession();
      if (!session) return;
      const mine = users.find((u) => u.username === session.username && u.staffId === staff.id);
      if (mine) {
        session.photo = mine.photo || null;
        session.displayName = mine.displayName;
        KF.setSession(session);
      }
    },

    lowStock() {
      return KF.getProducts().filter((p) => Number(p.qty) < LOW_STOCK_LIMIT);
    },

    activeSales() {
      return KF.getSales().filter((s) => !s.returned);
    },

    salesForDay(key) {
      return KF.activeSales().filter((s) => dayKey(s.time) === key);
    },

    totalProfit() {
      return KF.activeSales().reduce(
        (sum, s) => sum + s.items.reduce((a, l) => a + l.qty * (l.price - l.cost), 0),
        0,
      );
    },

    getShopName: () => read(KEYS.shopName, 'KASHFLOW'),
    setShopName: (name) => write(KEYS.shopName, name),

    orderNumber() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
      let s = '';
      for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return 'ORD-' + s;
    },

    recordSale(sale) {
      const products = KF.getProducts();
      sale.items.forEach((line) => {
        const p = products.find((x) => x.id === line.productId);
        if (p) p.qty = Math.max(0, (Number(p.qty) || 0) - line.qty);
      });
      const sales = KF.getSales();
      const record = { id: KF.nextId(sales), ...sale };
      sales.push(record);
      write(KEYS.sales, sales);
      KF.saveProducts(products);
      KF.notify({
        type: 'sale',
        title: 'New sale ' + record.orderNo,
        message: `${record.items.reduce((n, l) => n + l.qty, 0)} item(s) sold for ${money(record.total)} by ${record.cashier}.`,
        link: 'pos.html#order=' + encodeURIComponent(record.orderNo),
      });
      return record;
    },

    returnSale(orderNo, by) {
      const sales = KF.getSales();
      const sale = sales.find((s) => (s.orderNo || '').toUpperCase() === String(orderNo).trim().toUpperCase());
      if (!sale) return { error: 'No order with that number was found.' };
      if (sale.returned) return { error: `Order ${sale.orderNo} was already returned on ${KF.formatDateTime(sale.returnedAt)}.` };

      const products = KF.getProducts();
      sale.items.forEach((line) => {
        const p = products.find((x) => x.id === line.productId);
        if (p) p.qty = (Number(p.qty) || 0) + line.qty;
      });
      sale.returned = true;
      sale.returnedAt = new Date().toISOString();
      sale.returnedBy = by;
      write(KEYS.sales, sales);
      KF.saveProducts(products);
      KF.notify({
        type: 'sale',
        title: 'Order returned ' + sale.orderNo,
        message: `${sale.items.reduce((n, l) => n + l.qty, 0)} item(s) worth ${money(sale.total)} returned to stock by ${by}.`,
        link: 'pos.html#order=' + encodeURIComponent(sale.orderNo),
      });
      return { sale };
    },

    getNotifications: () => read(KEYS.notifications, []),
    saveNotifications: (list) => write(KEYS.notifications, list),
    notify({ type, title, message, link = null, key = null }) {
      const list = KF.getNotifications();
      const n = { id: KF.nextId(list), type, title, message, link, key, time: new Date().toISOString(), read: false };
      list.push(n);
      if (list.length > 200) list.splice(0, list.length - 200);
      write(KEYS.notifications, list);
      return n;
    },
    unreadCount() {
      return KF.getNotifications().filter((n) => !n.read).length;
    },
    syncLowStockNotifications() {
      const list = KF.getNotifications();
      const products = KF.getProducts();
      let changed = false;
      products.forEach((p) => {
        const key = 'low-' + p.id;
        const existing = list.find((n) => n.key === key);
        const isLow = Number(p.qty) < LOW_STOCK_LIMIT;
        const qty = Number(p.qty) || 0;
        const message = qty <= 0
          ? `${p.name} is out of stock. Restock now.`
          : `Only ${KF.stockLabel(p)} left in the shop. Restock soon.`;
        if (isLow && !existing) {
          list.push({
            id: KF.nextId(list), type: 'low', key, qty,
            title: (qty <= 0 ? 'Out of stock: ' : 'Low stock: ') + p.name,
            message, link: 'products.html', time: new Date().toISOString(), read: false,
          });
          changed = true;
        } else if (isLow && existing && existing.qty !== qty) {
          existing.qty = qty;
          existing.title = (qty <= 0 ? 'Out of stock: ' : 'Low stock: ') + p.name;
          existing.message = message;
          existing.time = new Date().toISOString();
          existing.read = false;
          changed = true;
        } else if (!isLow && existing) {
          list.splice(list.indexOf(existing), 1);
          changed = true;
        }
      });
      if (changed) write(KEYS.notifications, list);
    },
    getLastLogin: () => read(KEYS.lastLogin, null),
    setLastLogin: (iso) => write(KEYS.lastLogin, iso),

    getTheme: () => read(KEYS.theme, 'dark'),
    setTheme(theme) {
      write(KEYS.theme, theme);
      document.documentElement.setAttribute('data-theme', theme);
    },

    getSession() {
      if (global.KFCloud && KFCloud.enabled()) {
        const cloudSession = KFCloud.session();
        if (cloudSession) {
          const account = KF.findAccount(cloudSession.username);
          if (account) {
            const profile = KF.resolveAccountProfile(account);
            cloudSession.displayName = profile.displayName || cloudSession.displayName;
            cloudSession.photo = profile.photo || cloudSession.photo;
            cloudSession.staffId = profile.staffId || cloudSession.staffId;
          }
          return cloudSession;
        }
      }
      const s = readSession();
      if (!s || typeof s.username !== 'string') return null;
      if (s.shopId && s.token) {
        if (s.roleTitle) s.role = KF.accessLevel(s.roleTitle) || s.role;
        return s;
      }
      if (typeof s.token !== 'string') return null;
      const tokens = read(KEYS.authTokens, {});
      if (tokens[s.token] !== s.username) return null;
      const account = KF.findAccount(s.username);
      if (!account) return null;
      s.role = KF.accessLevel(account.role);
      s.roleTitle = account.role;
      return s;
    },
    setSession(s) {
      const current = readSession();
      if (!current || !current.token) return;
      sessionStorage.setItem(KEYS.session, JSON.stringify({ ...s, token: current.token, username: current.username }));
    },
    startSession(data) {
      const token = newToken();
      const tokens = read(KEYS.authTokens, {});
      tokens[token] = data.username;
      write(KEYS.authTokens, tokens);
      sessionStorage.setItem(KEYS.session, JSON.stringify({ ...data, token }));
    },
    clearSession() {
      if (global.KFCloud && KFCloud.enabled()) {
        KFCloud.signOut();
      }
      const s = readSession();
      if (s && s.token) {
        const tokens = read(KEYS.authTokens, {});
        delete tokens[s.token];
        write(KEYS.authTokens, tokens);
      }
      sessionStorage.removeItem(KEYS.session);
    },
    endSessionsFor(username, exceptToken) {
      const tokens = read(KEYS.authTokens, {});
      Object.keys(tokens).forEach((t) => {
        if (tokens[t] === username && t !== exceptToken) delete tokens[t];
      });
      write(KEYS.authTokens, tokens);
    },
    renameSession(oldName, newName) {
      const s = readSession();
      const tokens = read(KEYS.authTokens, {});
      KF.endSessionsFor(oldName, s && s.token);
      if (s && s.token && tokens[s.token] === oldName) {
        const fresh = read(KEYS.authTokens, {});
        fresh[s.token] = newName;
        write(KEYS.authTokens, fresh);
        sessionStorage.setItem(KEYS.session, JSON.stringify({ ...s, username: newName }));
      }
    },
    currentToken() {
      const s = readSession();
      return s ? s.token : null;
    },

    TRIAL_MS,
    ensureTrialStart() {
      if (!read(KEYS.trialStarted, null)) write(KEYS.trialStarted, new Date().toISOString());
    },
    trialStartedAt() {
      const s = KF.getSession();
      if (s && s.trialStartedAt) return s.trialStartedAt;
      return read(KEYS.trialStarted, null);
    },
    isLicensed() {
      const s = KF.getSession();
      if (s && KF.isReservedUsername(s.username)) return true;
      if (s && s.licensed) return true;
      return !!read(KEYS.licensed, false);
    },
    isTrialLocked() {
      if (KF.isLicensed()) return false;
      const start = KF.trialStartedAt();
      if (!start) return false;
      const t = Date.parse(start);
      if (!t) return false;
      return Date.now() - t >= TRIAL_MS;
    },
    trialMsLeft() {
      if (KF.isLicensed()) return null;
      const start = KF.trialStartedAt();
      if (!start) return TRIAL_MS;
      const t = Date.parse(start);
      if (!t) return TRIAL_MS;
      return Math.max(0, t + TRIAL_MS - Date.now());
    },
    trialLabel() {
      const ms = KF.trialMsLeft();
      if (ms == null) return '';
      if (ms <= 0) return 'ended';
      const h = Math.floor(ms / 3600000);
      if (h >= 1) return h + (h === 1 ? ' hour left' : ' hours left');
      const m = Math.max(1, Math.ceil(ms / 60000));
      return m + (m === 1 ? ' min left' : ' min left');
    },
    markLicensed() {
      write(KEYS.licensed, true);
      const s = readSession();
      if (s) {
        s.licensed = true;
        sessionStorage.setItem(KEYS.session, JSON.stringify(s));
      }
      if (global.KFCloud && KFCloud.session && KFCloud.session()) KFCloud.session().licensed = true;
    },
    async verifyActivationCode(code) {
      const password = String(code || '').trim();
      if (!password || !global.crypto || !crypto.subtle) return false;
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(LICENSE_SECRET.salt), iterations: LICENSE_SECRET.iterations },
        key,
        256,
      );
      const got = bytesToHex(bits);
      let diff = got.length ^ LICENSE_SECRET.hash.length;
      for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ LICENSE_SECRET.hash.charCodeAt(i);
      return diff === 0;
    },

    MAX_LOGIN_TRIES: 5,
    LOGIN_LOCK_MS: 5 * 60 * 1000,
    getLoginLock: () => read(KEYS.loginLock, { fails: 0, until: 0 }),
    setLoginLock: (lock) => write(KEYS.loginLock, lock),
    clearLoginLock: () => localStorage.removeItem(KEYS.loginLock),

    tourDone: (username) => read(KEYS.tourDone, []).includes(username),
    markTourDone(username) {
      const done = read(KEYS.tourDone, []);
      if (!done.includes(username)) done.push(username);
      write(KEYS.tourDone, done);
    },
    replayTour(username) {
      write(KEYS.tourDone, read(KEYS.tourDone, []).filter((u) => u !== username));
    },

    ZOOM_MIN: 0.8,
    ZOOM_MAX: 1.2,
    ZOOM_STEP: 0.1,
    clampZoom: (z) => Math.min(KF.ZOOM_MAX, Math.max(KF.ZOOM_MIN, Math.round((Number(z) || 1) * 10) / 10)),
    getZoom: () => KF.clampZoom(read(KEYS.zoom, 1)),
    setZoom(z) {
      const v = KF.clampZoom(z);
      write(KEYS.zoom, v);
      document.documentElement.style.zoom = v === 1 ? '' : String(v);
      return v;
    },

    resetShop() {
      const session = KF.getSession();
      const keep = session
        ? KF.getUsers().find((u) => u.username === session.username)
        : null;
      write(KEYS.products, []);
      write(KEYS.categories, []);
      write(KEYS.suppliers, []);
      write(KEYS.sales, []);
      write(KEYS.staff, []);
      write(KEYS.notifications, []);
      write(KEYS.seeded, true);
      write(KEYS.demoSalesRemoved, true);
      write(KEYS.demoCatalogCleared, true);
      localStorage.removeItem(KEYS.shopName);
      localStorage.removeItem(KEYS.lastLogin);
      const token = KF.currentToken();
      write(KEYS.authTokens, session && token ? { [token]: session.username } : {});
      KF.saveUsers(keep ? [keep] : []);
      return keep;
    },
  };

  global.KF = KF;
})(window);
