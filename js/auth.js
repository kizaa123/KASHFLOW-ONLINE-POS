/* Login page – checks the shop's User Accounts (and the hidden support login). */
(function () {
  if (KF.needsSetup() && !KF.getSession()) {
    window.location.replace('setup.html');
    return;
  }

  const existing = KF.getSession();
  if (existing) {
    window.location.replace(existing.role === 'admin' ? 'dashboard.html' : 'pos.html');
    return;
  }

  const form = document.getElementById('loginForm');
  const userEl = document.getElementById('username');
  const passEl = document.getElementById('password');
  const roleEl = document.getElementById('role');
  const errEl = document.getElementById('loginError');
  const toggle = document.getElementById('togglePassword');

  toggle.addEventListener('click', () => {
    const show = passEl.type === 'password';
    passEl.type = show ? 'text' : 'password';
    toggle.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

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

  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    errEl.hidden = true;

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
    if (KF.isReservedUsername(username)) {
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
    KF.startSession({
      username: user.username,
      role: user.role,
      roleTitle: user.roleTitle,
      displayName: user.displayName,
      photo: user.photo,
      staffId: user.staffId,
      loginAt: now,
      lastLoginAt: lastLogin ? lastLogin.time : null,
    });
    KF.setLastLogin({ time: now, username: user.username });
    KF.notify({
      type: 'login',
      title: 'Login',
      message: `${user.displayName} (${user.roleTitle}) logged in${lastLogin ? '. Previous login: ' + KF.formatDateTime(lastLogin.time) + ' by ' + lastLogin.username : ''}.`,
      link: user.role === 'admin' ? 'dashboard.html' : 'pos.html',
    });
    window.location.href = user.role === 'admin' ? 'dashboard.html' : 'pos.html';
  });
})();
