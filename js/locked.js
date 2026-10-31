/* Trial ended: contact KB.TECH STUDIO or enter the licence key (same idea as offline KASHFLOW). */
(async function () {
  const PHONE_INTL = '233531806381';

  if (window.KFCloud && KFCloud.enabled()) {
    try { await KFCloud.ready(); } catch (e) { /* continue */ }
  }

  const session = KF.getSession();
  if (!session) {
    window.location.replace('login.html');
    return;
  }

  const userEl = document.getElementById('lockUser');
  const errEl = document.getElementById('lockError');
  const keyEl = document.getElementById('licenseKey');
  const form = document.getElementById('activateForm');
  const activateBtn = document.getElementById('activateBtn');

  userEl.textContent = session.displayName || session.username || '—';

  const waText = encodeURIComponent(
    `Hello KB.TECH STUDIO, my KASHFLOW Online trial ended. Please help me activate. My username is ${session.username || ''}.`,
  );
  document.getElementById('lockWhatsApp').href = `https://wa.me/${PHONE_INTL}?text=${waText}`;

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function goIn() {
    window.location.replace(session.role === 'admin' ? 'dashboard.html' : 'pos.html');
  }

  async function unlockShop() {
    KF.markLicensed();
    try {
      if (window.KFCloud && KFCloud.enabled() && KFCloud.session()) {
        await KFCloud.activateLicense();
      }
    } catch (e) { /* local unlock still stands */ }
  }

  if (KF.isLicensed() && !KF.isTrialLocked()) {
    goIn();
    return;
  }
  if (!KF.isTrialLocked()) {
    goIn();
    return;
  }

  keyEl.addEventListener('input', () => { errEl.hidden = true; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const key = keyEl.value.trim();
    if (!key) {
      showError('Enter the licence key KB.TECH STUDIO gave you.');
      keyEl.focus();
      return;
    }
    activateBtn.disabled = true;
    let ok = false;
    try {
      ok = await KF.verifyActivationCode(key);
    } catch (err) {
      ok = false;
    }
    if (!ok) {
      activateBtn.disabled = false;
      showError('That licence key is not valid. Call 053 180 6381 if you need help.');
      return;
    }
    await unlockShop();
    form.innerHTML = '<p class="lock-success"><i class="fa-solid fa-circle-check"></i> Activated! Opening your shop…</p>';
    setTimeout(goIn, 1200);
  });

  document.addEventListener('kf:sync', () => {
    if (!KF.isTrialLocked()) goIn();
  });
})();
