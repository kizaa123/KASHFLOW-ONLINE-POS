/* Notifications: sales, low stock alerts, products loaded and logins. */
(function () {
  const list = document.getElementById('notifList');
  const emptyState = document.getElementById('emptyState');
  const chips = document.getElementById('typeChips');
  let type = 'all';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICONS = {
    sale: 'fa-cart-shopping',
    low: 'fa-triangle-exclamation',
    product: 'fa-box',
    login: 'fa-right-to-bracket',
  };

  // "2 minutes ago", "Yesterday, 4:05 PM", or the full date for older items.
  function when(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (KF.dayKey(d) === KF.todayKey()) return 'Today, ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (KF.dayKey(d) === KF.yesterdayKey()) return 'Yesterday, ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return KF.formatDateTime(iso);
  }

  function renderSummary() {
    const session = KF.getSession();
    document.getElementById('lastLogin').textContent = session && session.lastLoginAt
      ? KF.formatDateTime(session.lastLoginAt)
      : (session ? KF.formatDateTime(session.loginAt) + ' (this session)' : '—');
    KFUI.countTo(document.getElementById('unreadTotal'), KF.unreadCount(), { duration: 500 });
    KFUI.countTo(document.getElementById('lowTotal'), KF.lowStock().length, { duration: 500 });
    KFUI.countTo(document.getElementById('salesToday'), KF.salesForDay(KF.todayKey()).length, { duration: 500 });
  }

  function render() {
    const all = KF.getNotifications().slice().sort((a, b) => new Date(b.time) - new Date(a.time));
    const items = type === 'all' ? all : all.filter((n) => n.type === type);
    emptyState.hidden = items.length > 0;
    list.innerHTML = items.map((n) => `
      <li class="notif-item ${n.type}${n.read ? '' : ' unread'}" data-id="${n.id}">
        <span class="notif-icon"><i class="fa-solid ${ICONS[n.type] || 'fa-bell'}"></i></span>
        <div class="notif-text">
          <div class="notif-title">${esc(n.title)}${n.read ? '' : ' <span class="dot"></span>'}</div>
          <div class="notif-msg">${esc(n.message)}</div>
        </div>
        <div class="notif-side">
          <span class="notif-time">${when(n.time)}</span>
          <div class="notif-btns">
            <button type="button" class="act del" data-act="delete" title="Remove"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
      </li>`).join('');
    renderSummary();
    KFUI.refreshBell();
  }

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    type = b.dataset.type;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
    render();
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('.notif-item');
    if (!li) return;
    const id = Number(li.dataset.id);
    const all = KF.getNotifications();
    const n = all.find((x) => x.id === id);
    if (!n) return;

    if (e.target.closest('[data-act="delete"]')) {
      KF.saveNotifications(all.filter((x) => x.id !== id));
      render();
      return;
    }
    if (!n.read) {
      n.read = true;
      KF.saveNotifications(all);
      render();
    }
    if (n.link) window.location.href = n.link;
  });

  document.getElementById('markAllBtn').addEventListener('click', () => {
    const all = KF.getNotifications();
    all.forEach((n) => { n.read = true; });
    KF.saveNotifications(all);
    render();
    KFUI.toast('All notifications marked as read.');
  });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (KF.getNotifications().length === 0) return;
    if (!confirm('Clear all notifications?')) return;
    KF.saveNotifications([]);
    render();
    KFUI.toast('Notifications cleared.', 'error');
  });

  render();
})();
