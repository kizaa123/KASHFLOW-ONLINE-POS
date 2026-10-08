/* Trial ended: Paystack checkout, then unlock. WhatsApp and activation code stay as backup. */
(async function () {
  if (window.KFCloud && KFCloud.enabled()) {
    try { await KFCloud.ready(); } catch (e) { /* continue */ }
  }

  const session = KF.getSession();
  if (!session) {
    window.location.replace('login.html');
    return;
  }
  if (!KF.isTrialLocked()) {
    window.location.replace(session.role === 'admin' ? 'dashboard.html' : 'pos.html');
    return;
  }

  const cfg = window.KF_PAYSTACK || {};
  const userEl = document.getElementById('lockUser');
  const priceEl = document.getElementById('lockPrice');
  const emailEl = document.getElementById('payEmail');
  const errEl = document.getElementById('lockError');
  const payBtn = document.getElementById('payBtn');
  const form = document.getElementById('activateForm');
  const keyEl = document.getElementById('licenseKey');

  userEl.textContent = session.username || '—';
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
    try {
      if (window.KFCloud && KFCloud.enabled() && KFCloud.session()) {
        await KFCloud.activateLicense({ paystackRef });
      }
      KF.markLicensed();
    } catch (err) {
      KF.markLicensed();
    }
    payBtn.disabled = true;
    errEl.hidden = true;
    payBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Paid. Opening your shop…';
    setTimeout(goIn, 1100);
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
      try {
        await verifyPaystack(tran.reference);
        await unlock(tran.reference);
      } catch (err) {
        payBtn.disabled = false;
        showError((err.message || 'Payment received, but it could not be confirmed.') + ' WhatsApp us with your receipt.');
      }
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const code = keyEl.value.trim();
    if (!code) return showError('Enter the activation code.');
    const ok = await KF.verifyActivationCode(code);
    if (!ok) return showError('That code is not valid.');
    await unlock('');
  });

  document.addEventListener('kf:sync', () => {
    if (!KF.isTrialLocked()) goIn();
  });
})();
