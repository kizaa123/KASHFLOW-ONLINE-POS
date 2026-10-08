/* Login and owner Create account — one page for every client. */
(async function () {
  if (window.KFCloud && KFCloud.enabled()) {
    try { await KFCloud.ready(); } catch (e) { /* continue */ }
  }

  const existing = KF.getSession();
  if (existing) {
    window.location.replace(KF.isTrialLocked() ? 'locked.html' : (existing.role === 'admin' ? 'dashboard.html' : 'pos.html'));
    return;
  }

  const form = document.getElementById('loginForm');
  const userEl = document.getElementById('username');
  const passEl = document.getElementById('password');
  const confirmEl = document.getElementById('confirmPassword');
  const roleEl = document.getElementById('role');
  const errEl = document.getElementById('loginError');
  const submitBtn = document.getElementById('authSubmit');
  const confirmWrap = document.getElementById('confirmWrap');
  const roleWrap = document.getElementById('roleWrap');
  const noteEl = document.getElementById('authNote');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');

  let mode = 'login';

  function bindEye(btn, input) {
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }
  bindEye(document.getElementById('togglePassword'), passEl);
  bindEye(document.getElementById('toggleConfirm'), confirmEl);

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function setMode(next) {
    mode = next;
    const register = mode === 'register';
    tabLogin.classList.toggle('active', !register);
    tabRegister.classList.toggle('active', register);
    tabLogin.setAttribute('aria-selected', register ? 'false' : 'true');
    tabRegister.setAttribute('aria-selected', register ? 'true' : 'false');
    confirmWrap.hidden = !register;
    roleWrap.hidden = register;
    submitBtn.textContent = register ? 'Create account' : 'Login';
    passEl.autocomplete = register ? 'new-password' : 'current-password';
    passEl.placeholder = register ? 'Password (at least 6 characters)' : 'Enter password';
    noteEl.textContent = register
      ? 'This is the owner account. After this, add cashiers on User Accounts. Cashiers do not register here.'
      : 'Cashiers sign in here with the username the owner created. They do not create an account.';
    errEl.hidden = true;
    if (register) history.replaceState(null, '', '#create');
    else history.replaceState(null, '', location.pathname.split('/').pop() || 'login.html');
    userEl.focus();
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));

  const wantCreate = /^(#create|#register|#signup)$/i.test(location.hash) ||
    (!(window.KFCloud && KFCloud.enabled()) && KF.needsSetup());
  if (wantCreate) setMode('register');

  function lockedMessage(until) {
    const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
    return `Too many wrong attempts. Login is locked. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
  }

  function recordFailure(username) {
    const lock = KF.getLoginLock();
    lock.fails = (lock.fails || 0) + 1;
    if (lock.fails >= KF.MAX_LOGIN_TRIES) {
      lock.until = Date.now() + KF.LOGIN_LOCK_MS;
      lock.fails = 0;
      KF.setLoginLock(lock);
      KF.notify({
        type: 'login',
        title: 'Login blocked',
        message: `${KF.MAX_LOGIN_TRIES} wrong passwords in a row (last tried username: "${username}"). Login was locked for ${KF.LOGIN_LOCK_MS / 60000} minutes.`,
      });
      return lockedMessage(lock.until);
    }
    KF.setLoginLock(lock);
    return 'Invalid username or password.';
  }

  function goIn(role) {
    window.location.replace(KF.isTrialLocked() ? 'locked.html' : (role === 'admin' ? 'dashboard.html' : 'pos.html'));
  }

  function enterAsAdmin(username) {
    KF.ensureTrialStart();
    const now = new Date().toISOString();
    KF.startSession({
      username,
      role: 'admin',
      roleTitle: 'Administrator',
      displayName: username,
      photo: null,
      staffId: null,
      loginAt: now,
      lastLoginAt: null,
      trialStartedAt: KF.trialStartedAt(),
      licensed: KF.isLicensed(),
    });
    KF.setLastLogin({ time: now, username });
    KF.notify({
      type: 'login',
      title: 'Account created',
      message: `Administrator "${username}" was created. Add cashiers on User Accounts, then load products.`,
      link: 'users.html',
    });
    goIn('admin');
  }

  async function createAccount() {
    const username = userEl.value.trim().toLowerCase();
    const password = passEl.value;
    const cloud = window.KFCloud && KFCloud.enabled();

    if (!username) return showError('Choose a username.');
    if (!/^[a-z0-9._-]{3,}$/.test(username)) return showError('Username: at least 3 letters or numbers, no spaces (dot, dash and underscore are fine).');
    if (KF.isReservedUsername(username)) return showError('That username is reserved. Choose another one.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');
    if (password.toLowerCase() === username) return showError('Password must not be the same as the username.');
    if (password !== confirmEl.value) return showError('The two passwords do not match.');

    if (!cloud && !KF.needsSetup()) {
      return showError('This computer already has an owner account. Log in, or connect Firebase so more than one business can register online.');
    }

    submitBtn.disabled = true;
    if (cloud) {
      try {
        await KFCloud.registerShop({ username, password });
      } catch (err) {
        submitBtn.disabled = false;
        return showError(err.message || 'Could not create the account.');
      }
    }

    const now = new Date().toISOString();
    const users = KF.getUsers();
    if (users.some((u) => u.username === username) && !cloud) {
      submitBtn.disabled = false;
      return showError('That username is already taken.');
    }
    if (!users.some((u) => u.username === username)) {
      users.push({
        id: KF.nextId(users),
        username,
        password: cloud ? '' : password,
        role: 'Administrator',
        staffId: null,
        displayName: username,
        photo: null,
        createdAt: now,
      });
      KF.saveUsers(users);
    }
    KF.ensureTrialStart();
    KF.seedIfEmpty();

    const cloudSession = window.KFCloud && KFCloud.session && KFCloud.session();
    if (cloudSession) {
      KF.notify({
        type: 'login',
        title: 'Account created',
        message: `Administrator "${username}" is live. Add cashiers on User Accounts, load products, then they can sell on any computer.`,
        link: 'users.html',
      });
      goIn('admin');
      return;
    }
    enterAsAdmin(username);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    errEl.hidden = true;

    if (mode === 'register') {
      await createAccount();
      return;
    }

    const lock = KF.getLoginLock();
    if (lock.until && lock.until > Date.now()) {
      showError(lockedMessage(lock.until));
      return;
    }

    const username = userEl.value.trim().toLowerCase();
    const password = passEl.value;
    const role = roleEl.value;
    if (!username || !password) {
      showError('Enter your username and password.');
      return;
    }

    let account = null;
    if (window.KFCloud && KFCloud.enabled() && !KF.isReservedUsername(username)) {
      submitBtn.disabled = true;
      try {
        const s = await KFCloud.signIn(username, password);
        if (s.role !== role) {
          await KFCloud.signOut();
          submitBtn.disabled = false;
          showError(`This account is not a${role === 'admin' ? 'n Administrator' : ' Cashier'}. Choose the correct "Login As" option.`);
          return;
        }
        KF.clearLoginLock();
        goIn(s.role);
        return;
      } catch (err) {
        submitBtn.disabled = false;
        passEl.value = '';
        const locked = recordFailure(username);
        showError(locked.indexOf('locked') !== -1 ? locked : (err.message || 'Invalid username or password.'));
        return;
      }
    } else if (KF.isReservedUsername(username)) {
      submitBtn.disabled = true;
      try { account = await KF.verifySupportLogin(username, password); } catch (err) { account = null; }
      submitBtn.disabled = false;
    } else {
      account = KF.getUsers().find((u) => u.username === username && u.password === password) || null;
    }
    if (!account) {
      passEl.value = '';
      showError(recordFailure(username));
      return;
    }
    KF.clearLoginLock();
    const profile = KF.resolveAccountProfile(account);
    const user = {
      username: account.username,
      role: KF.accessLevel(account.role),
      roleTitle: account.role,
      displayName: profile.displayName,
      photo: profile.photo,
      staffId: profile.staffId,
    };
    if (user.role !== role) {
      showError(`This account is not a${role === 'admin' ? 'n Administrator' : ' Cashier'}. Choose the correct "Login As" option.`);
      return;
    }

    KF.seedIfEmpty();
    const now = new Date().toISOString();
    const lastLogin = KF.getLastLogin();
    if (!KF.isReservedUsername(user.username)) KF.ensureTrialStart();
    KF.startSession({
      username: user.username,
      role: user.role,
      roleTitle: user.roleTitle,
      displayName: user.displayName,
      photo: user.photo,
      staffId: user.staffId,
      loginAt: now,
      lastLoginAt: lastLogin ? lastLogin.time : null,
      trialStartedAt: KF.trialStartedAt(),
      licensed: KF.isLicensed(),
    });
    KF.setLastLogin({ time: now, username: user.username });
    KF.notify({
      type: 'login',
      title: 'Login',
      message: `${user.displayName} (${user.roleTitle}) logged in${lastLogin ? '. Previous login: ' + KF.formatDateTime(lastLogin.time) + ' by ' + lastLogin.username : ''}.`,
      link: user.role === 'admin' ? 'dashboard.html' : 'pos.html',
    });
    goIn(user.role);
  });
})();
