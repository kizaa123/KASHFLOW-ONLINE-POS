/* First-run setup: the shop owner creates the first Administrator account, then is logged in. */
(async function () {
  if (window.KFCloud && KFCloud.enabled()) {
    try { await KFCloud.ready(); } catch (e) { /* continue */ }
    if (KF.getSession()) {
      window.location.replace('dashboard.html');
      return;
    }
  } else if (!KF.needsSetup()) {
    window.location.replace('login.html');
    return;
  }

  const form = document.getElementById('setupForm');
  const userEl = document.getElementById('setupUsername');
  const passEl = document.getElementById('setupPassword');
  const confirmEl = document.getElementById('setupConfirm');
  const errEl = document.getElementById('setupError');

  document.querySelectorAll('[data-eye]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.eye);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  setTimeout(() => userEl.focus(), 400);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    if (!window.KFCloud || !KFCloud.enabled()) {
      if (!KF.needsSetup()) {
        window.location.replace('login.html');
        return;
      }
    }

    const username = userEl.value.trim().toLowerCase();
    const password = passEl.value;

    if (!username) return showError('Choose a username.');
    if (!/^[a-z0-9._-]{3,}$/.test(username)) return showError('Username: at least 3 letters or numbers, no spaces (dot, dash and underscore are fine).');
    if (KF.isReservedUsername(username)) return showError('That username is reserved. Choose another one.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');
    if (password.toLowerCase() === username) return showError('Password must not be the same as the username.');
    if (password !== confirmEl.value) return showError('The two passwords do not match.');

    const now = new Date().toISOString();

    if (window.KFCloud && KFCloud.enabled()) {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await KFCloud.registerShop({ username, password });
      } catch (err) {
        submitBtn.disabled = false;
        return showError(err.message || 'Could not create the online shop. Check Firebase config.');
      }
    }

    const users = KF.getUsers();
    if (users.some((u) => u.username === username) && !(window.KFCloud && KFCloud.enabled())) {
      return showError('That username is already taken.');
    }
    if (!users.some((u) => u.username === username)) {
      users.push({
        id: KF.nextId(users),
        username,
        password: (window.KFCloud && KFCloud.enabled()) ? '' : password,
        role: 'Administrator',
        staffId: null,
        displayName: username,
        photo: null,
        createdAt: now,
      });
      KF.saveUsers(users);
    }
    KF.seedIfEmpty();

    const cloudSession = window.KFCloud && KFCloud.session && KFCloud.session();
    if (cloudSession) {
      KF.notify({
        type: 'login',
        title: 'Account created',
        message: `Administrator "${username}" is live. Add cashiers on User Accounts, load products, then they can sell on any computer.`,
        link: 'users.html',
      });
      window.location.replace('dashboard.html');
      return;
    }

    KF.startSession({
      username,
      role: 'admin',
      roleTitle: 'Administrator',
      displayName: username,
      photo: null,
      staffId: null,
      loginAt: now,
      lastLoginAt: null,
    });
    KF.setLastLogin({ time: now, username });
    KF.notify({
      type: 'login',
      title: 'Account created',
      message: `Administrator "${username}" was created and logged in. Add cashiers on User Accounts, then load products.`,
      link: 'users.html',
    });
    window.location.replace('dashboard.html');
  });
})();
