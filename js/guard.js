/* Loaded in <head> of every signed-in page, before anything is drawn.
   No valid login from the login page -> the page is hidden and the user is sent to login. */
(function () {
  const CASHIER_PAGES = ['pos', 'help', 'contact', 'notifications'];
  const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'dashboard';

  function lockOut(target) {
    document.documentElement.style.display = 'none';
    window.location.replace(target);
  }

  function check() {
    const session = KF.getSession();
    if (!session) {
      sessionStorage.removeItem(KF.KEYS.session);
      lockOut('login.html');
      return;
    }
    if (session.role !== 'admin' && !CASHIER_PAGES.includes(page)) lockOut('pos.html');
  }

  check();
  KF.setZoom(KF.getZoom());
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
  window.addEventListener('storage', (e) => {
    if (e.key === KF.KEYS.authTokens || e.key === KF.KEYS.users || e.key === null) check();
  });
})();
