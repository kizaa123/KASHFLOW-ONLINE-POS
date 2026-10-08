/* Trial ended: Paystack checkout unlocks the shop at once. WhatsApp is only for help. */
(async function () {
  if (window.KFCloud && KFCloud.enabled()) {
    try { await KFCloud.ready(); } catch (e) { /* continue */ }
  }

  const session = KF.getSession();
  if (!session) {
    window.location.replace('login.html');
    return;
  }

  const cfg = window.KF_PAYSTACK || {};
  const userEl = document.getElementById('lockUser');
  const priceEl = document.getElementById('lockPrice');
  const emailEl = document.getElementById('payEmail');
  const errEl = document.getElementById('lockError');
  const payBtn = document.getElementById('payBtn');

  userEl.textContent = session.displayName || session.username || '—';
  const amountGhs = Number(cfg.amountGhs) || 0;
  priceEl.textContent = amountGhs ? amountGhs.toFixed(2) : '—';

  const waText = encodeURIComponent(
    `Hello KB.TECH STUDIO, I want to pay for KASHFLOW Online. My username is ${session.username || ''}.`,
  );
  document.getElementById('lockWhatsApp').href = `https://wa.me/233531806381?text=${waText}`;

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function goIn() {
    window.location.replace(session.role === 'admin' ? 'dashboard.html' : 'pos.html');
  }

  async function unlock(paystackRef) {
    KF.markLicensed();
    try {
      if (window.KFCloud && KFCloud.enabled() && KFCloud.session()) {
        await KFCloud.activateLicense({ paystackRef });
      }
    } catch (err) { /* local unlock still stands */ }
    sessionStorage.removeItem('kf_pay_ref');
    payBtn.disabled = true;
    errEl.hidden = true;
    payBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Paid. Opening your shop…';
    goIn();
  }

  async function verifyPaystack(reference) {
    const res = await fetch('/.netlify/functions/verify-paystack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, shopId: session.shopId || '' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      throw new Error(json.message || 'Could not confirm payment.');
    }
    return json;
  }

  const pendingRef = new URLSearchParams(location.search).get('reference')
    || sessionStorage.getItem('kf_pay_ref');
  if (KF.isLicensed() && !KF.isTrialLocked()) {
    goIn();
    return;
  }
  if (pendingRef) {
    KF.markLicensed();
    unlock(pendingRef);
    return;
  }
  if (!KF.isTrialLocked()) {
    goIn();
    return;
  }

  payBtn.addEventListener('click', () => {
    errEl.hidden = true;
    const key = String(cfg.publicKey || '');
    if (!key.startsWith('pk_') || key.indexOf('YOUR_KEY') !== -1) {
      showError('Paystack is not set up yet. Use WhatsApp to pay.');
      return;
    }
    if (!amountGhs) {
      showError('Licence price is not set.');
      return;
    }
    const email = emailEl.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Enter a real email for your Paystack receipt.');
      emailEl.focus();
      return;
    }
    if (typeof PaystackPop === 'undefined') {
      showError('Could not load Paystack. Check your internet and try again.');
      return;
    }

    payBtn.disabled = true;
    const amount = Math.round(amountGhs * 100);
    const meta = {
      shopId: session.shopId || '',
      username: session.username || '',
      custom_fields: [
        { display_name: 'KASHFLOW user', variable_name: 'username', value: session.username || '' },
      ],
    };
    const onPaid = async (tran) => {
      const reference = (tran && (tran.reference || tran.trxref)) || '';
      if (reference) sessionStorage.setItem('kf_pay_ref', reference);
      KF.markLicensed();
      try {
        if (reference) await verifyPaystack(reference);
      } catch (err) { /* Paystack already confirmed success in the popup */ }
      await unlock(reference);
    };
    const onCancel = () => { payBtn.disabled = false; };

    if (typeof PaystackPop === 'function' && PaystackPop.prototype && PaystackPop.prototype.newTransaction) {
      const pop = new PaystackPop();
      pop.newTransaction({
        key, email, amount, currency: cfg.currency || 'GHS',
        channels: ['card', 'mobile_money', 'bank_transfer'],
        metadata: meta, onSuccess: onPaid, onCancel,
      });
      return;
    }
    if (PaystackPop.setup) {
      const handler = PaystackPop.setup({
        key, email, amount, currency: cfg.currency || 'GHS',
        channels: ['card', 'mobile_money', 'bank_transfer'],
        metadata: meta, callback: onPaid, onClose: onCancel,
      });
      handler.openIframe();
      return;
    }
    payBtn.disabled = false;
    showError('Could not start Paystack. Refresh and try again.');
  });

  document.addEventListener('kf:sync', () => {
    if (!KF.isTrialLocked()) goIn();
  });
})();
