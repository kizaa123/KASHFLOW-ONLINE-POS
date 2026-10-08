/* Staff Management: list, search, sort filter, add/edit/delete with circular profile photos. */
(function () {
  const body = document.getElementById('staffBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');

  const modal = document.getElementById('staffModal');
  const form = document.getElementById('staffForm');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('formError');
  const f = {
    id: document.getElementById('staffId'),
    name: document.getElementById('staffName'),
    phone: document.getElementById('staffPhone'),
    role: document.getElementById('staffRole'),
    roleOther: document.getElementById('staffRoleOther'),
    otherField: document.getElementById('otherRoleField'),
    photoInput: document.getElementById('photoInput'),
    photoPreview: document.getElementById('photoPreview'),
    removePhoto: document.getElementById('removePhotoBtn'),
    createLogin: document.getElementById('createLogin'),
    loginFields: document.getElementById('loginFields'),
    loginHint: document.getElementById('linkedLoginHint'),
    username: document.getElementById('staffUsername'),
    password: document.getElementById('staffPassword'),
    togglePw: document.getElementById('toggleStaffPassword'),
  };

  let sort = 'newest';
  let photoData = null;
  let usernameTouched = false;
  const BASE_ROLES = ['Administrator', 'Cashier'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
  const roleClass = (role) => (role === 'Administrator' ? 'admin' : role === 'Cashier' ? 'cashier' : 'other');

  function avatarHtml(s) {
    if (s.photo) return `<div class="staff-avatar"><img src="${s.photo}" alt="${esc(s.name)}" /></div>`;
    return `<div class="staff-avatar initials">${esc(initials(s.name)) || '<i class="fa-solid fa-user"></i>'}</div>`;
  }

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const list = KF.getStaff().filter((s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.role || '').toLowerCase().includes(q));

    list.sort((a, b) => {
      if (sort === 'az') return a.name.localeCompare(b.name);
      if (sort === 'za') return b.name.localeCompare(a.name);
      if (sort === 'role') return a.role.localeCompare(b.role) || a.name.localeCompare(b.name);
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return sort === 'oldest' ? d : -d;
    });

    emptyState.hidden = list.length > 0;
    body.innerHTML = list.map((s) => `
      <tr data-id="${s.id}">
        <td>${avatarHtml(s)}</td>
        <td><span class="cat-name">${esc(s.name)}</span></td>
        <td><a class="phone-link" href="tel:${esc((s.phone || '').replace(/\s+/g, ''))}">${esc(s.phone) || '—'}</a></td>
        <td><span class="role-badge ${roleClass(s.role)}">${esc(s.role)}</span></td>
        <td class="muted-cell">${KF.formatDateTime(s.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button class="act edit" data-act="edit" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="act del" data-act="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  // ---- Modal helpers ----
  function setPhoto(src) {
    photoData = src || null;
    f.photoPreview.innerHTML = src
      ? `<img src="${src}" alt="Profile photo" /><span class="hint overlay"><i class="fa-solid fa-camera"></i> Change</span>`
      : '<i class="fa-solid fa-user"></i><span class="hint">Add photo</span>';
    f.photoPreview.classList.toggle('has-image', !!src);
    f.removePhoto.hidden = !src;
  }
  function linkedUser(staffId) {
    return KF.getUsers().find((u) => u.staffId === staffId) || null;
  }

  function setLoginUi(staff) {
    const existing = staff ? linkedUser(staff.id) : null;
    usernameTouched = false;
    const box = f.createLogin.closest('.check-row');
    f.password.value = '';
    f.password.type = 'password';
    if (f.togglePw) f.togglePw.innerHTML = '<i class="fa-regular fa-eye"></i>';
    if (existing) {
      box.hidden = true;
      f.createLogin.checked = false;
      f.loginFields.hidden = true;
      f.loginHint.hidden = false;
      f.loginHint.textContent = `Login account: ${existing.username}`;
      f.username.value = existing.username;
      return;
    }
    box.hidden = false;
    f.createLogin.checked = !staff;
    f.loginFields.hidden = !f.createLogin.checked;
    f.loginHint.hidden = true;
    f.loginHint.textContent = '';
    const slug = staff ? KF.usernameFromName(staff.name) : '';
    f.username.value = slug.length >= 3 ? slug : '';
  }
  function syncRole() {
    const other = f.role.value === 'Other';
    f.otherField.hidden = !other;
    if (!other) f.roleOther.value = '';
  }
  function openModal(staff) {
    form.reset();
    errEl.hidden = true;
    f.photoInput.value = '';
    if (staff) {
      title.innerHTML = '<i class="fa-solid fa-user-pen"></i> Edit Staff';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
      f.id.value = staff.id;
      f.name.value = staff.name;
      f.phone.value = staff.phone || '';
      if (BASE_ROLES.includes(staff.role)) {
        f.role.value = staff.role;
      } else {
        f.role.value = 'Other';
        f.roleOther.value = staff.role;
      }
      setPhoto(staff.photo);
    } else {
      title.innerHTML = '<i class="fa-solid fa-user-plus"></i> New Staff';
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Staff';
      f.id.value = '';
      f.role.value = 'Cashier';
      setPhoto(null);
    }
    f.otherField.hidden = f.role.value !== 'Other';
    setLoginUi(staff);
    KFUI.openModal(modal);
    setTimeout(() => f.name.focus(), 50);
  }
  function closeModal() {
    KFUI.closeModal(modal);
  }
  function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }

  // ---- Events ----
  document.getElementById('addStaffBtn').addEventListener('click', () => openModal(null));
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

  f.role.addEventListener('change', () => { syncRole(); if (f.role.value === 'Other') f.roleOther.focus(); });
  f.photoPreview.addEventListener('click', () => f.photoInput.click());
  f.photoInput.addEventListener('change', async () => {
    const file = f.photoInput.files[0];
    if (!file) return;
    try { setPhoto(await KFUI.readImage(file, 240)); }
    catch (e) { showError('Could not read that image file.'); }
  });
  f.removePhoto.addEventListener('click', () => { f.photoInput.value = ''; setPhoto(null); });
  f.createLogin.addEventListener('change', () => {
    f.loginFields.hidden = !f.createLogin.checked;
    if (f.createLogin.checked && !f.username.value) {
      const slug = KF.usernameFromName(f.name.value);
      if (slug.length >= 3) f.username.value = slug;
    }
  });
  f.name.addEventListener('input', () => {
    if (usernameTouched || !f.createLogin.checked || f.loginFields.hidden) return;
    const slug = KF.usernameFromName(f.name.value);
    f.username.value = slug.length >= 3 ? slug : '';
  });
  f.username.addEventListener('input', () => { usernameTouched = true; });
  if (f.togglePw) {
    f.togglePw.addEventListener('click', () => {
      const show = f.password.type === 'password';
      f.password.type = show ? 'text' : 'password';
      f.togglePw.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    let role = f.role.value;
    if (role === 'Other') role = f.roleOther.value.trim();

    if (!name) return showError('Enter the staff member\'s full name.');
    if (!phone) return showError('Enter the phone number.');
    if (!/^[+\d][\d\s\-()]{6,}$/.test(phone)) return showError('Enter a valid phone number.');
    if (!role) return showError('Specify the role for this staff member.');

    const list = KF.getStaff();
    const editingId = f.id.value ? Number(f.id.value) : null;
    if (list.some((s) => (s.phone || '').replace(/\s+/g, '') === phone.replace(/\s+/g, '') && s.id !== editingId)) {
      return showError('Another staff member already uses that phone number.');
    }

    const staffId = editingId || KF.nextId(list);
    const makeLogin = f.createLogin.checked && !linkedUser(staffId);
    let loginUser = null;
    if (makeLogin) {
      const username = f.username.value.trim().toLowerCase();
      const password = f.password.value;
      if (!username) return showError('Enter a username for the login account.');
      if (!/^[a-z0-9._-]{3,}$/.test(username)) return showError('Username must be at least 3 characters: letters, numbers, dot, dash or underscore.');
      if (KF.isReservedUsername(username)) return showError('That username is reserved. Choose another one.');
      if (!password || password.length < 6) return showError('Password must be at least 6 characters.');
      if (password.toLowerCase() === username) return showError('Password must not be the same as the username.');
      const users = KF.getUsers();
      if (users.some((u) => u.username === username)) return showError('That username is already taken.');
      loginUser = { username, password };
    }

    const record = editingId
      ? { ...list[list.findIndex((s) => s.id === editingId)], name, phone, role, photo: photoData }
      : { id: staffId, name, phone, role, photo: photoData, createdAt: new Date().toISOString() };

    if (editingId) list[list.findIndex((s) => s.id === editingId)] = record;
    else list.push(record);

    try { KF.saveStaff(list); }
    catch (err) { return showError('Storage is full. Try a smaller photo.'); }

    KF.syncStaffProfileToUsers(record);

    if (loginUser) {
      if (window.KFCloud && KFCloud.enabled()) {
        try { await KFCloud.provisionUser(loginUser.username, loginUser.password, role); }
        catch (err) { return showError(err.message || 'Could not create the online login.'); }
      }
      const users = KF.getUsers();
      users.push({
        id: KF.nextId(users),
        username: loginUser.username,
        password: (window.KFCloud && KFCloud.enabled()) ? '' : loginUser.password,
        role,
        staffId,
        displayName: name,
        photo: photoData || null,
        createdAt: new Date().toISOString(),
      });
      try { KF.saveUsers(users); }
      catch (err) { return showError('Staff was saved but the login could not be stored. Try a smaller photo.'); }
      KFUI.toast(editingId ? 'Login account created for this staff member.' : 'Staff added with a login account.');
    } else {
      KFUI.toast(editingId ? 'Staff updated.' : 'Staff added.');
    }

    closeModal();
    render();
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const list = KF.getStaff();
    const staff = list.find((s) => s.id === id);
    if (!staff) return;

    if (btn.dataset.act === 'edit') openModal(staff);
    if (btn.dataset.act === 'delete') {
      if (!confirm(`Remove "${staff.name}" from staff?`)) return;
      KF.saveStaff(list.filter((s) => s.id !== id));
      const users = KF.getUsers();
      let changed = false;
      users.forEach((u) => {
        if (u.staffId === id) { u.staffId = null; changed = true; }
      });
      if (changed) KF.saveUsers(users);
      KFUI.toast('Staff removed.', 'error');
      render();
    }
  });

  document.addEventListener('kf:sync', render);
  render();
})();
