/* Loaded in <head> of every signed-in page, before anything is drawn.
   No valid login from the login page -> the page is hidden and the user is sent to login. */
(function () {
  const CASHIER_PAGES = ['pos', 'help', 'contact', 'notifications'];
  const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'dashboard';
  document.documentElement.style.visibility = 'hidden';

  function lockOut(target) {
    document.documentElement.style.display = 'none';
    window.location.replace(target);
  }

  function check() {
    const session = KF.getSession();
    if (!session) {
      lockOut('login.html');
      return false;
    }
    if (page === 'locked') {
      if (!KF.isTrialLocked()) {
        lockOut(session.role === 'admin' ? 'dashboard.html' : 'pos.html');
        return false;
      }
      document.documentElement.style.visibility = '';
      return true;
    }
    if (KF.isTrialLocked()) {
      lockOut('locked.html');
      return false;
    }
    if (session.role !== 'admin' && !CASHIER_PAGES.includes(page)) {
      lockOut('pos.html');
      return false;
    }
    document.documentElement.style.visibility = '';
    return true;
  }

  async function start() {
    try {
      if (window.KFCloud && KFCloud.enabled()) await KFCloud.ready();
    } catch (e) { /* continue */ }
    if (!check()) return;
    KF.setZoom(KF.getZoom());
  }

  start();
  window.addEventListener('pageshow', (e) => { if (e.persisted) check(); });
  window.addEventListener('storage', (e) => {
    if (e.key === KF.KEYS.authTokens || e.key === KF.KEYS.users || e.key === null) check();
  });
})();
