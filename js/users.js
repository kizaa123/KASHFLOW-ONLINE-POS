/* User Accounts: username, password and role for everyone who can log in. */
(function () {
  const body = document.getElementById('userBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');

  const modal = document.getElementById('userModal');
  const form = document.getElementById('userForm');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('formError');
  const f = {
    id: document.getElementById('userId'),
    staff: document.getElementById('staffLink'),
    chip: document.getElementById('staffChip'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    toggle: document.getElementById('togglePassword'),
    role: document.getElementById('role'),
  };

  let sort = 'newest';
  let usernameTouched = false;
  const revealed = new Set();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roleClass = (role) => (role === 'Administrator' ? 'admin' : role === 'Cashier' ? 'cashier' : 'other');

  // ---------- Table ----------
  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const list = KF.getUsers().filter((u) => {
      if (!q) return true;
      return u.username.toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
    });

    list.sort((a, b) => {
      if (sort === 'az') return a.username.localeCompare(b.username);
      if (sort === 'za') return b.username.localeCompare(a.username);
      if (sort === 'role') return a.role.localeCompare(b.role) || a.username.localeCompare(b.username);
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return sort === 'oldest' ? d : -d;
    });

    emptyState.hidden = list.length > 0;
    body.innerHTML = list.map((u, i) => `
      <tr data-id="${u.id}">
        <td class="num">${i + 1}</td>
        <td><span class="cat-name">${esc(u.username)}</span></td>
        <td>
          <span class="pw-cell">
            <code class="pw">${revealed.has(u.id) ? esc(u.password) : '••••••••'}</code>
            <button type="button" class="pw-toggle" data-act="reveal" title="${revealed.has(u.id) ? 'Hide' : 'Show'} password">
              <i class="fa-regular ${revealed.has(u.id) ? 'fa-eye-slash' : 'fa-eye'}"></i>
            </button>
          </span>
        </td>
        <td><span class="role-badge ${roleClass(u.role)}">${esc(u.role)}</span></td>
        <td class="muted-cell">${KF.formatDateTime(u.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button class="act edit" data-act="edit" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="act del" data-act="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  // ---------- Modal ----------
  function fillRoleSelect(current) {
    // Administrator and Cashier, plus any custom roles used in Staff Management.
    const roles = ['Administrator', 'Cashier'];
    KF.getStaff().forEach((s) => { if (s.role && !roles.includes(s.role)) roles.push(s.role); });
    if (current && !roles.includes(current)) roles.push(current);
    f.role.innerHTML = roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  }

  function fillStaffSelect(currentId, editingId) {
    const taken = new Set(KF.getUsers().filter((u) => u.staffId && u.id !== editingId).map((u) => Number(u.staffId)));
    const opts = ['<option value="">No staff linked</option>'];
    KF.getStaff().forEach((s) => {
      const used = taken.has(s.id) && s.id !== currentId;
      opts.push(`<option value="${s.id}"${s.id === currentId ? ' selected' : ''}${used ? ' disabled' : ''}>${esc(s.name)}${used ? ' (already has a login)' : ''}</option>`);
    });
    f.staff.innerHTML = opts.join('');
    f.staff.value = currentId ? String(currentId) : '';
  }

  function selectedStaff() {
    const id = Number(f.staff.value);
    return id ? KF.getStaff().find((s) => s.id === id) : null;
  }

  function paintStaffChip() {
    const s = selectedStaff();
    if (!s) { f.chip.hidden = true; f.chip.innerHTML = ''; return; }
    const photo = s.photo
      ? `<div class="staff-avatar small"><img src="${s.photo}" alt="" /></div>`
      : `<div class="staff-avatar small initials">${esc((s.name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join(''))}</div>`;
    f.chip.innerHTML = `${photo}<div><strong>${esc(s.name)}</strong><p class="muted">This photo will show when they log in</p></div><span class="role-badge ${roleClass(s.role)}">${esc(s.role)}</span>`;
    f.chip.hidden = false;
  }

  function applyStaffToForm(s, forceUser) {
    if (!s) { paintStaffChip(); return; }
    if (forceUser || !usernameTouched) {
      const slug = KF.usernameFromName(s.name);
      if (slug.length >= 3) f.username.value = slug;
    }
    if ([...f.role.options].some((o) => o.value === s.role)) f.role.value = s.role;
    paintStaffChip();
  }

  function openModal(user) {
    form.reset();
    errEl.hidden = true;
    f.password.type = 'password';
    f.toggle.innerHTML = '<i class="fa-regular fa-eye"></i>';
    fillRoleSelect(user ? user.role : null);
    fillStaffSelect(user && user.staffId ? Number(user.staffId) : null, user ? user.id : null);
    usernameTouched = !!user;

    if (user) {
      title.innerHTML = '<i class="fa-solid fa-user-pen"></i> Edit Account';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
      f.id.value = user.id;
      f.username.value = user.username;
      f.password.value = user.password;
      f.role.value = user.role;
    } else {
      title.innerHTML = '<i class="fa-solid fa-user-plus"></i> New Account';
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Account';
      f.id.value = '';
      f.role.value = 'Cashier';
    }
    paintStaffChip();
    KFUI.openModal(modal);
    setTimeout(() => f.username.focus(), 50);
  }
  function closeModal() {
    KFUI.closeModal(modal);
  }
  function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }

  // ---------- Events ----------
  document.getElementById('addUserBtn').addEventListener('click', () => openModal(null));
  document.getElementById('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  searchInput.addEventListener('input', render);
  document.getElementById('searchBtn').addEventListener('click', () => { render(); searchInput.focus(); });

  filterBtn.addEventListener('click', (e) => { e.stopPropagation(); filterMenu.hidden = !filterMenu.hidden; });
  filterMenu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    sort = b.dataset.sort;
    filterMenu.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    filterMenu.hidden = true;
    render();
  });
  document.addEventListener('click', () => { filterMenu.hidden = true; });

  f.toggle.addEventListener('click', () => {
    const show = f.password.type === 'password';
    f.password.type = show ? 'text' : 'password';
    f.toggle.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
  });
  f.username.addEventListener('input', () => { usernameTouched = true; });
  f.staff.addEventListener('change', () => applyStaffToForm(selectedStaff(), !usernameTouched));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const username = f.username.value.trim().toLowerCase();
    const password = f.password.value;
    const role = f.role.value;
    const staff = selectedStaff();

    if (!username) return showError('Enter a username.');
    if (!/^[a-z0-9._-]{3,}$/.test(username)) return showError('Username must be at least 3 characters: letters, numbers, dot, dash or underscore.');
    if (KF.isReservedUsername(username)) return showError('That username is reserved. Choose another one.');
    if (!role) return showError('Choose a role.');

    const list = KF.getUsers();
    const editingId = f.id.value ? Number(f.id.value) : null;
    const before = editingId ? list.find((u) => u.id === editingId) : null;
    const passwordChanged = !before || before.password !== password;
    if (!password) return showError('Enter a password.');
    if (passwordChanged && password.length < 6) return showError('Password must be at least 6 characters.');
    if (passwordChanged && password.toLowerCase() === username) return showError('Password must not be the same as the username.');
    if (list.some((u) => u.username === username && u.id !== editingId)) return showError('That username is already taken.');
    if (staff && list.some((u) => u.staffId === staff.id && u.id !== editingId)) {
      return showError('That staff member already has a login account.');
    }

    if (editingId) {
      const idx = list.findIndex((u) => u.id === editingId);
      const wasLastAdmin = list[idx].role === 'Administrator' && role !== 'Administrator' &&
        !list.some((u) => u.role === 'Administrator' && u.id !== editingId);
      if (wasLastAdmin) return showError('There must be at least one Administrator account.');
      list[idx] = {
        ...list[idx],
        username,
        password,
        role,
        staffId: staff ? staff.id : null,
        displayName: staff ? staff.name : (list[idx].displayName || username),
        photo: staff ? (staff.photo || null) : list[idx].photo,
      };
      const isMe = KF.getSession()?.username === before.username;
      KF.saveUsers(list);
      if (isMe) {
        if (before.username !== username) KF.renameSession(before.username, username);
        if (passwordChanged) KF.endSessionsFor(username, KF.currentToken());
      } else if (passwordChanged || before.role !== role || before.username !== username) {
        KF.endSessionsFor(before.username);
      }
      KFUI.toast('Account updated.');
    } else {
      if (window.KFCloud && KFCloud.enabled()) {
        try {
          await KFCloud.provisionUser(username, password, role);
        } catch (err) {
          return showError(err.message || 'Could not create the online login.');
        }
      }
      list.push({
        id: KF.nextId(list),
        username,
        password: (window.KFCloud && KFCloud.enabled()) ? '' : password,
        role,
        staffId: staff ? staff.id : null,
        displayName: staff ? staff.name : username,
        photo: staff ? (staff.photo || null) : null,
        createdAt: new Date().toISOString(),
      });
      KFUI.toast('Account created.');
    }
    KF.saveUsers(list);
    closeModal();
    render();
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const list = KF.getUsers();
    const user = list.find((u) => u.id === id);
    if (!user) return;

    if (btn.dataset.act === 'reveal') {
      revealed.has(id) ? revealed.delete(id) : revealed.add(id);
      render();
    }
    if (btn.dataset.act === 'edit') openModal(user);
    if (btn.dataset.act === 'delete') {
      const admins = list.filter((u) => u.role === 'Administrator');
      if (user.role === 'Administrator' && admins.length === 1) {
        KFUI.toast('You cannot delete the only Administrator account.', 'error');
        return;
      }
      const session = KF.getSession();
      if (session && session.username === user.username) {
        KFUI.toast('You cannot delete the account you are signed in with.', 'error');
        return;
      }
      if (!confirm(`Delete the account "${user.username}"?`)) return;
      KF.saveUsers(list.filter((u) => u.id !== id));
      KF.endSessionsFor(user.username);
      KFUI.toast('Account deleted.', 'error');
      render();
    }
  });

  document.addEventListener('kf:sync', render);
  render();
})();
