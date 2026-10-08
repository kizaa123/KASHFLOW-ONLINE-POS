/* Contact Us: name, role and message, then open WhatsApp or SMS to the support number. */
(function () {
  const PHONE_LOCAL = '0531806381';
  const PHONE_INTL = '233531806381'; // Ghana, leading 0 dropped

  const form = document.getElementById('contactForm');
  const nameEl = document.getElementById('contactName');
  const roleEl = document.getElementById('contactRole');
  const msgEl = document.getElementById('contactMessage');
  const errEl = document.getElementById('contactError');
  const session = KF.getSession();

  function fillRoles() {
    const roles = ['Administrator', 'Cashier'];
    KF.getStaff().forEach((s) => {
      if (s.role && !roles.includes(s.role)) roles.push(s.role);
    });
    KF.getUsers().forEach((u) => {
      if (u.role && !roles.includes(u.role)) roles.push(u.role);
    });
    roleEl.innerHTML = '<option value="">Select your role</option>' +
      roles.map((r) => `<option value="${r.replace(/"/g, '&quot;')}">${r}</option>`).join('');
  }

  fillRoles();
  if (session) {
    nameEl.value = session.displayName || session.username || '';
    if (session.roleTitle && [...roleEl.options].some((o) => o.value === session.roleTitle)) {
      roleEl.value = session.roleTitle;
    }
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function compose() {
    const name = nameEl.value.trim();
    const role = roleEl.value;
    const message = msgEl.value.trim();
    if (!name) return { error: 'Enter your full name.' };
    if (!role) return { error: 'Select your role.' };
    if (!message) return { error: 'Type a message so we know how to help.' };
    const text = `Hello, I am ${name} (${role}).\n\n${message}\n\nSent from KASHFLOW`;
    return { text };
  }

  let channel = 'whatsapp';
  form.querySelectorAll('[data-channel]').forEach((btn) => {
    btn.addEventListener('click', () => { channel = btn.dataset.channel; });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const result = compose();
    if (result.error) {
      showError(result.error);
      KFUI.toast(result.error, 'error');
      return;
    }
    const encoded = encodeURIComponent(result.text);
    if (channel === 'sms') {
      window.location.href = `sms:+${PHONE_INTL}?body=${encoded}`;
      KFUI.toast('Opening SMS to ' + PHONE_LOCAL);
    } else {
      window.open(`https://wa.me/${PHONE_INTL}?text=${encoded}`, '_blank', 'noopener');
      KFUI.toast('Opening WhatsApp to ' + PHONE_LOCAL);
    }
  });
})();
