/* Shared behaviour for every signed-in page: session guard, sidebar, theme toggle, logout, toasts. */
(function () {
  const session = KF.getSession();
  if (!session) {
    window.location.replace('login.html');
    return;
  }
  KF.seedIfEmpty();

  // ---- Sidebar (rendered once here so every page stays identical) ----
  const NAV = [
    { href: 'dashboard.html', icon: 'fa-gauge-high', label: 'Dashboard' },
    { href: 'products.html', icon: 'fa-box', label: 'Products' },
    { href: 'categories.html', icon: 'fa-list', label: 'Categories' },
    { href: 'suppliers.html', icon: 'fa-truck', label: 'Suppliers' },
    { href: 'staff.html', icon: 'fa-users', label: 'Staff Management', admin: true },
    { href: 'users.html', icon: 'fa-user-gear', label: 'User Accounts', admin: true },
    { href: 'pos.html', icon: 'fa-cash-register', label: 'POS' },
    { href: 'report.html', icon: 'fa-chart-line', label: 'Report' },
    { href: 'help.html', icon: 'fa-circle-question', label: 'Help Center' },
    { href: 'contact.html', icon: 'fa-envelope', label: 'Contact Us' },
  ];
  const current = (location.pathname.split('/').pop() || 'dashboard').replace(/\.html$/, '') || 'dashboard';
  const isCashier = session.role !== 'admin';
  const CASHIER_HREFS = ['pos.html', 'help.html', 'contact.html'];
  const CASHIER_PAGES = new Set(['pos', 'help', 'contact', 'notifications']);
  if (isCashier && !CASHIER_PAGES.has(current)) {
    window.location.replace('pos.html');
    return;
  }
  const navItems = isCashier
    ? NAV.filter((n) => CASHIER_HREFS.includes(n.href))
    : NAV.filter((n) => !n.admin || session.role === 'admin');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safePhoto = (src) => (typeof src === 'string' && src.startsWith('data:image/') ? esc(src) : null);

  const aside = document.getElementById('sidebar');
  if (aside) {
    if (isCashier) document.body.classList.add('cashier-view');
    aside.className = 'sidebar';
    aside.innerHTML = `
      <div class="sidebar-brand">
        <div class="avatar" id="sidebarAvatar" title="Profile">${safePhoto(session.photo) ? `<img src="${safePhoto(session.photo)}" alt="" />` : '<i class="fa-solid fa-user-shield"></i>'}</div>
        <button type="button" id="editProfileBtn" class="sidebar-edit">edit</button>
        <h2>${esc(session.displayName || 'System Admin')}</h2>
        ${session.roleTitle ? `<p class="sidebar-role">${esc(session.roleTitle)}</p>` : ''}
      </div>
      <nav class="nav">
        ${navItems
          .map((n) => `<a class="nav-link${n.href.replace('.html', '') === current ? ' active' : ''}" href="${n.href}" title="${n.label}"><i class="fa-solid ${n.icon}"></i><span class="nav-label"> ${n.label}</span></a>`)
          .join('')}
      </nav>
      <div class="sidebar-clock" aria-live="off">
        <span class="clock-time" id="clockTime">--:--:--</span>
        <span class="clock-date" id="clockDate"></span>
      </div>
      <button id="logoutBtn" class="nav-link logout" title="Logout"><i class="fa-solid fa-right-from-bracket"></i><span class="nav-label"> Logout</span></button>`;

    // Live clock: 16:26:21 / Mon, 5 Oct 2026
    const timeEl = aside.querySelector('#clockTime');
    const dateEl = aside.querySelector('#clockDate');
    const pad = (n) => String(n).padStart(2, '0');
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const tick = () => {
      const d = new Date();
      timeEl.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      dateEl.textContent = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---- Mobile menu (hamburger + slide-out sidebar) ----
  const scrim = document.createElement('button');
  scrim.type = 'button';
  scrim.id = 'navScrim';
  scrim.className = 'nav-scrim';
  scrim.setAttribute('aria-label', 'Close menu');
  document.body.appendChild(scrim);

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.id = 'menuBtn';
  menuBtn.className = 'menu-btn';
  menuBtn.setAttribute('aria-label', 'Open menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-controls', 'sidebar');
  menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';

  function syncNavBtn() {
    menuBtn.setAttribute('aria-expanded', document.body.classList.contains('nav-open') ? 'true' : 'false');
  }
  function closeNav() { document.body.classList.remove('nav-open'); syncNavBtn(); }
  function toggleNav() { document.body.classList.toggle('nav-open'); syncNavBtn(); }
  scrim.addEventListener('click', closeNav);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
  menuBtn.addEventListener('click', toggleNav);
  window.matchMedia('(max-width: 900px)').addEventListener('change', (e) => {
    if (!e.matches) closeNav();
  });

  const mobileBar = document.createElement('div');
  mobileBar.className = 'mobile-bar';
  mobileBar.innerHTML = `<span class="mobile-bar-title">${esc(KF.getShopName())}</span>`;
  mobileBar.prepend(menuBtn);
  const main = document.querySelector('main.content');
  // Keep the bar outside .content so the page-open animation does not restart or clip the drawer.
  if (main && main.parentNode) main.parentNode.insertBefore(mobileBar, main);

  // ---- Footer quick links ----
  const footer = document.getElementById('appFooter');
  if (footer) {
    footer.className = 'app-footer';
    footer.innerHTML = `
      <nav class="footer-links">
        ${navItems
          .filter((n) => n.href !== 'help.html')
          .map((n) => `<a href="${n.href}"><i class="fa-solid ${n.icon}"></i> ${n.label.replace('Staff Management', 'Staff').replace('User Accounts', 'Users')}</a>`)
          .join('')}
      </nav>
      ${current === 'dashboard' ? `<button type="button" id="resetBtn" class="btn-reset" title="Clear all shop data. Your login account stays.">RESET</button>` : ''}
      <p>&copy; ${new Date().getFullYear()} KASHFLOW Inventory System. All rights reserved.</p>`;
  }

  const nameEl = document.getElementById('welcomeName');
  if (nameEl) nameEl.textContent = session.username;

  // ---- Theme toggle ----
  const toggle = document.getElementById('themeToggle');
  function paintToggle() {
    if (!toggle) return;
    const dark = KF.getTheme() === 'dark';
    toggle.innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    toggle.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      KF.setTheme(KF.getTheme() === 'dark' ? 'light' : 'dark');
      paintToggle();
      document.dispatchEvent(new CustomEvent('kf:themechange'));
    });
    paintToggle();
  }

  // ---- Logout ----
  const logout = document.getElementById('logoutBtn');
  if (logout) {
    logout.addEventListener('click', () => {
      KF.clearSession();
      window.location.replace('login.html');
    });
  }

  // ---- Shared UI helpers ----
  window.KFUI = window.KFUI || {};
  KFUI._countSeq = 0;
  KFUI.reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  KFUI.countTo = function (el, target, opts) {
    if (!el) return;
    const o = opts || {};
    const to = Number(target) || 0;
    const decimals = o.decimals || 0;
    const duration = o.duration == null ? 750 : o.duration;
    const prefix = o.prefix || '';
    const suffix = o.suffix || '';
    const money = !!o.money;
    const from = el.dataset.countVal === undefined ? 0 : Number(el.dataset.countVal);
    el.dataset.countVal = String(to);
    const write = (n) => {
      const val = decimals ? n : Math.round(n);
      if (money) {
        el.textContent = prefix + Number(val).toLocaleString('en-GH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      } else {
        el.textContent = prefix + Number(val).toLocaleString('en-GH', { maximumFractionDigits: decimals }) + suffix;
      }
    };
    if (KFUI.reduceMotion() || duration < 50) { write(to); return; }
    const id = String(++KFUI._countSeq);
    el.dataset.countId = id;
    const start = Number.isFinite(from) ? from : 0;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const frame = (now) => {
      if (el.dataset.countId !== id) return;
      const p = Math.min(1, (now - t0) / duration);
      write(start + (to - start) * ease(p));
      if (p < 1) requestAnimationFrame(frame);
      else write(to);
    };
    requestAnimationFrame(frame);
  };

  KFUI.openModal = function (el) {
    if (!el) return;
    if (el._leaveTimer) { clearTimeout(el._leaveTimer); el._leaveTimer = null; }
    el.hidden = false;
    el.classList.remove('is-leaving');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('is-open'));
    });
    document.body.classList.add('modal-open');
  };
  KFUI.closeModal = function (el) {
    if (!el || el.hidden) return;
    el.classList.remove('is-open');
    el.classList.add('is-leaving');
    const finish = () => {
      if (el._leaveTimer) { clearTimeout(el._leaveTimer); el._leaveTimer = null; }
      el.hidden = true;
      el.classList.remove('is-leaving', 'is-open');
      if (!document.querySelector('.modal-backdrop.is-open')) document.body.classList.remove('modal-open');
    };
    el._leaveTimer = setTimeout(finish, KFUI.reduceMotion() ? 0 : 300);
  };

  // ---- Unread-notifications badge on the bell ----
  KF.syncLowStockNotifications();
  KFUI.refreshBell = function () {
    const badge = document.getElementById('notifCount');
    if (!badge) return;
    const n = KF.unreadCount();
    badge.textContent = n > 99 ? '99+' : n;
    badge.hidden = n === 0;
  };
  KFUI.refreshBell();
  const bell = document.getElementById('notifBtn');
  if (bell && !bell.dataset.bound) {
    bell.dataset.bound = '1';
    bell.title = 'Notifications';
    bell.addEventListener('click', () => { window.location.href = 'notifications.html'; });
  }
  // Keep the badge current when another tab records a sale or alert.
  window.addEventListener('storage', (e) => { if (e.key === KF.KEYS.notifications) KFUI.refreshBell(); });

  // ---- Toast messages ----
  KFUI.toast = function (message, type = 'success') {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}"></i> `;
    el.append(String(message));
    host.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
  };

  // ---- Read a picked image file and shrink it to fit in local storage ----
  KFUI.readImage = function (file, max = 220) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // ---- Zoom (Ctrl + / Ctrl - / Ctrl 0 / Ctrl + mouse wheel), limited to 80%–120% ----
  let zoomToastAt = 0;
  function stepZoom(dir) {
    const before = KF.getZoom();
    const after = dir === 0 ? KF.setZoom(1) : KF.setZoom(before + dir * KF.ZOOM_STEP);
    if (dir !== 0 && after === before && Date.now() - zoomToastAt > 1500) {
      zoomToastAt = Date.now();
      KFUI.toast(`Zoom limit reached (${Math.round(KF.ZOOM_MIN * 100)}%–${Math.round(KF.ZOOM_MAX * 100)}%). Ctrl + 0 resets it.`, 'error');
    }
  }
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); stepZoom(-1); }
    else if (e.key === '0') { e.preventDefault(); stepZoom(0); }
  });
  let lastWheelZoom = 0;
  document.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    // One wheel notch fires many events; take one step at most every 200ms.
    if (Date.now() - lastWheelZoom < 200) return;
    lastWheelZoom = Date.now();
    stepZoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  // ---- Sidebar edit: photo, shop name, theme ----
  const editBtn = document.getElementById('editProfileBtn');
  if (editBtn) {
    const modal = document.createElement('div');
    modal.id = 'profileModal';
    modal.className = 'modal-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal modal-sm profile-modal" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
        <header class="modal-head">
          <h3 id="profileTitle"><i class="fa-solid fa-pen"></i> Edit profile</h3>
          <button type="button" class="modal-close" id="profileClose" aria-label="Close">&times;</button>
        </header>
        <form id="profileForm" class="modal-body" novalidate>
          <div class="field">
            <label>Profile picture</label>
            <div class="image-field">
              <button type="button" id="profilePreview" class="image-preview round" title="Click to choose a photo" aria-label="Choose profile picture">
                <i class="fa-solid fa-user"></i>
                <span class="hint">Add photo</span>
              </button>
              <input id="profilePhotoInput" type="file" accept="image/*" hidden />
              <button type="button" id="profileRemovePhoto" class="link-btn" hidden><i class="fa-solid fa-trash"></i> Remove photo</button>
            </div>
          </div>
          <div class="field">
            <label for="shopNameInput">Shop name</label>
            <input id="shopNameInput" type="text" maxlength="40" placeholder="e.g. KASHFLOW" />
            <p class="field-hint">Shown as the header on receipts and report exports.</p>
          </div>
          <div class="field">
            <label>Theme</label>
            <div class="theme-picks">
              <label class="theme-pick"><input type="radio" name="profileTheme" value="dark" /> Dark</label>
              <label class="theme-pick"><input type="radio" name="profileTheme" value="light" /> Light</label>
            </div>
          </div>
          <button type="submit" class="btn-purple full"><i class="fa-solid fa-floppy-disk"></i> Save</button>
        </form>
      </div>`;
    document.body.appendChild(modal);

    const preview = document.getElementById('profilePreview');
    const fileInput = document.getElementById('profilePhotoInput');
    const removeBtn = document.getElementById('profileRemovePhoto');
    const shopInput = document.getElementById('shopNameInput');
    let pendingPhoto = null;

    function paintPreview() {
      if (pendingPhoto) {
        preview.classList.add('has-image');
        preview.innerHTML = `<img src="${pendingPhoto}" alt="" /><span class="hint overlay">Change</span>`;
        removeBtn.hidden = false;
      } else {
        preview.classList.remove('has-image');
        preview.innerHTML = '<i class="fa-solid fa-user"></i><span class="hint">Add photo</span>';
        removeBtn.hidden = true;
      }
    }
    function paintSidebarPhoto() {
      const av = document.getElementById('sidebarAvatar');
      const s = KF.getSession();
      if (!av || !s) return;
      av.innerHTML = safePhoto(s.photo) ? `<img src="${safePhoto(s.photo)}" alt="" />` : '<i class="fa-solid fa-user-shield"></i>';
    }
    function openProfile() {
      const s = KF.getSession();
      pendingPhoto = (s && s.photo) || null;
      shopInput.value = KF.getShopName();
      const theme = KF.getTheme();
      modal.querySelectorAll('input[name="profileTheme"]').forEach((r) => { r.checked = r.value === theme; });
      paintPreview();
      KFUI.openModal(modal);
    }
    function closeProfile() {
      KFUI.closeModal(modal);
    }

    editBtn.addEventListener('click', openProfile);
    const av = document.getElementById('sidebarAvatar');
    if (av && isCashier) av.addEventListener('click', openProfile);
    document.getElementById('profileClose').addEventListener('click', closeProfile);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProfile(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeProfile(); });
    preview.addEventListener('click', () => fileInput.click());
    removeBtn.addEventListener('click', () => { pendingPhoto = null; paintPreview(); });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        pendingPhoto = await KFUI.readImage(file, 280);
        paintPreview();
      } catch (err) {
        KFUI.toast('That image could not be read.', 'error');
      }
    });

    document.getElementById('profileForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = shopInput.value.trim();
      KF.setShopName(name || 'KASHFLOW');
      const barTitle = document.querySelector('.mobile-bar-title');
      if (barTitle) barTitle.textContent = name || 'KASHFLOW';
      const picked = modal.querySelector('input[name="profileTheme"]:checked');
      if (picked) {
        KF.setTheme(picked.value);
        paintToggle();
        document.dispatchEvent(new CustomEvent('kf:themechange'));
      }
      const s = KF.getSession();
      if (s) {
        s.photo = pendingPhoto;
        KF.setSession(s);
        const users = KF.getUsers();
        const u = users.find((x) => x.username === s.username);
        if (u) {
          u.photo = pendingPhoto;
          KF.saveUsers(users);
          const staffId = u.staffId || s.staffId;
          if (staffId) {
            const staff = KF.getStaff();
            const st = staff.find((x) => x.id === Number(staffId));
            if (st) {
              st.photo = pendingPhoto;
              KF.saveStaff(staff);
            }
          }
        }
      }
      paintSidebarPhoto();
      closeProfile();
      KFUI.toast('Profile saved.');
    });
  }
})();
