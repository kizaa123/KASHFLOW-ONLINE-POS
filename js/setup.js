/* First-run setup: the shop owner creates the first Administrator account, then is logged in. */
(function () {
  if (!KF.needsSetup()) {
    window.location.replace('login.html');
    return;
  }

  const form = document.getElementById('setupForm');
  const shopEl = document.getElementById('setupShop');
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

  setTimeout(() => shopEl.focus(), 400);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.hidden = true;
    if (!KF.needsSetup()) {
      window.location.replace('login.html');
      return;
    }

    const shopName = shopEl.value.trim();
    const username = userEl.value.trim().toLowerCase();
    const password = passEl.value;

    if (!shopName) return showError('Enter the business or shop name.');
    if (shopName.length < 2) return showError('Shop name is too short.');
    if (!username) return showError('Choose a username.');
    if (!/^[a-z0-9._-]{3,}$/.test(username)) return showError('Username: at least 3 letters or numbers, no spaces (dot, dash and underscore are fine).');
    if (KF.isReservedUsername(username)) return showError('That username is reserved. Choose another one.');
    if (password.length < 6) return showError('Password must be at least 6 characters.');
    if (password.toLowerCase() === username) return showError('Password must not be the same as the username.');
    if (password !== confirmEl.value) return showError('The two passwords do not match.');

    const users = KF.getUsers();
    if (users.some((u) => u.username === username)) return showError('That username is already taken.');
    const now = new Date().toISOString();
    users.push({
      id: KF.nextId(users),
      username,
      password,
      role: 'Administrator',
      staffId: null,
      displayName: username,
      photo: null,
      createdAt: now,
    });
    KF.saveUsers(users);
    KF.setShopName(shopName);
    KF.seedIfEmpty();

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
      message: `${shopName} is live. Administrator "${username}" was created on first setup and logged in.`,
      link: 'users.html',
    });
    window.location.replace('dashboard.html');
  });
})();
