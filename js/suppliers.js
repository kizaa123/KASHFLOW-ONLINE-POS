/* Suppliers page: list, search, sort filter, add/edit/delete. */
(function () {
  const body = document.getElementById('supplierBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');

  const modal = document.getElementById('supplierModal');
  const form = document.getElementById('supplierForm');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('formError');
  const f = {
    id: document.getElementById('supplierId'),
    name: document.getElementById('supplierName'),
    phone: document.getElementById('supplierPhone'),
    location: document.getElementById('supplierLocation'),
    goods: document.getElementById('supplierGoods'),
  };

  let sort = 'newest';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const list = KF.getSuppliers().filter((s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.location || '').toLowerCase().includes(q) ||
      (s.goods || '').toLowerCase().includes(q));

    list.sort((a, b) => {
      if (sort === 'az') return a.name.localeCompare(b.name);
      if (sort === 'za') return b.name.localeCompare(a.name);
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return sort === 'oldest' ? d : -d;
    });

    emptyState.hidden = list.length > 0;
    body.innerHTML = list.map((s, i) => `
      <tr data-id="${s.id}">
        <td class="num">${i + 1}</td>
        <td><span class="cat-name">${esc(s.name)}</span></td>
        <td><a class="phone-link" href="tel:${esc((s.phone || '').replace(/\s+/g, ''))}">${esc(s.phone) || '—'}</a></td>
        <td>${esc(s.location) || '<span class="muted">—</span>'}</td>
        <td class="desc">${esc(s.goods) || '<span class="muted">—</span>'}</td>
        <td class="muted-cell">${KF.formatDateTime(s.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button class="act edit" data-act="edit" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="act del" data-act="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  // ---- Modal ----
  function openModal(sup) {
    form.reset();
    errEl.hidden = true;
    if (sup) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Supplier';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
      f.id.value = sup.id;
      f.name.value = sup.name;
      f.phone.value = sup.phone || '';
      f.location.value = sup.location || '';
      f.goods.value = sup.goods || '';
    } else {
      title.innerHTML = '<i class="fa-solid fa-circle-plus"></i> New Supplier';
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Supplier';
      f.id.value = '';
    }
    KFUI.openModal(modal);
    setTimeout(() => f.name.focus(), 50);
  }
  function closeModal() {
    KFUI.closeModal(modal);
  }
  function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }

  // ---- Events ----
  document.getElementById('addSupplierBtn').addEventListener('click', () => openModal(null));
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    const location = f.location.value.trim();
    const goods = f.goods.value.trim();

    if (!name) return showError('Enter the supplier or company name.');
    if (!phone) return showError('Enter the phone number.');
    if (!/^[+\d][\d\s\-()]{6,}$/.test(phone)) return showError('Enter a valid phone number.');
    if (!location) return showError('Enter the supplier location.');

    const list = KF.getSuppliers();
    const editingId = f.id.value ? Number(f.id.value) : null;
    if (list.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== editingId)) {
      return showError('A supplier with that name already exists.');
    }

    if (editingId) {
      const idx = list.findIndex((s) => s.id === editingId);
      list[idx] = { ...list[idx], name, phone, location, goods };
      KFUI.toast('Supplier updated.');
    } else {
      list.push({ id: KF.nextId(list), name, phone, location, goods, createdAt: new Date().toISOString() });
      KFUI.toast('Supplier added.');
    }
    KF.saveSuppliers(list);
    closeModal();
    render();
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const list = KF.getSuppliers();
    const sup = list.find((s) => s.id === id);
    if (!sup) return;

    if (btn.dataset.act === 'edit') openModal(sup);
    if (btn.dataset.act === 'delete') {
      const used = KF.getProducts().filter((p) => Number(p.supplierId) === id).length;
      if (used > 0) {
        KFUI.toast(`Cannot delete "${sup.name}": ${used} product${used > 1 ? 's' : ''} still linked to it.`, 'error');
        return;
      }
      if (!confirm(`Delete supplier "${sup.name}"?`)) return;
      KF.saveSuppliers(list.filter((s) => s.id !== id));
      KFUI.toast('Supplier deleted.', 'error');
      render();
    }
  });

  document.addEventListener('kf:sync', render);
  render();
})();
