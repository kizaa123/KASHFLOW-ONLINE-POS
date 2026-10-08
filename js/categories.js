/* Categories page: list, search, sort filter, add/edit/delete. */
(function () {
  const body = document.getElementById('categoryBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');

  const modal = document.getElementById('categoryModal');
  const form = document.getElementById('categoryForm');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('formError');
  const f = {
    id: document.getElementById('categoryId'),
    name: document.getElementById('categoryName'),
    desc: document.getElementById('categoryDesc'),
  };

  let sort = 'newest';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titleCase = (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    let list = KF.getCategories().filter((c) =>
      !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));

    list.sort((a, b) => {
      if (sort === 'az') return a.name.localeCompare(b.name);
      if (sort === 'za') return b.name.localeCompare(a.name);
      const d = new Date(a.createdAt) - new Date(b.createdAt);
      return sort === 'oldest' ? d : -d;
    });

    emptyState.hidden = list.length > 0;
    body.innerHTML = list.map((c, i) => `
      <tr data-id="${c.id}">
        <td class="num">${i + 1}</td>
        <td><span class="cat-name">${esc(c.name)}</span></td>
        <td class="desc">${esc(titleCase(c.description || '')) || '<span class="muted">—</span>'}</td>
        <td class="muted-cell">${KF.formatDateTime(c.createdAt)}</td>
        <td>
          <div class="row-actions">
            <button class="act edit" data-act="edit" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
            <button class="act del" data-act="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('');
  }

  // ---- Modal ----
  function openModal(cat) {
    form.reset();
    errEl.hidden = true;
    if (cat) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Category';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
      f.id.value = cat.id;
      f.name.value = cat.name;
      f.desc.value = cat.description || '';
    } else {
      title.innerHTML = '<i class="fa-solid fa-circle-plus"></i> New Category';
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Category';
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
  document.getElementById('addCategoryBtn').addEventListener('click', () => openModal(null));
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
    const description = f.desc.value.trim();
    if (!name) return showError('Enter the category name.');

    const list = KF.getCategories();
    const editingId = f.id.value ? Number(f.id.value) : null;
    if (list.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingId)) {
      return showError('A category with that name already exists.');
    }

    if (editingId) {
      const idx = list.findIndex((c) => c.id === editingId);
      list[idx] = { ...list[idx], name, description };
      KFUI.toast('Category updated.');
    } else {
      list.push({ id: KF.nextId(list), name, description, createdAt: new Date().toISOString() });
      KFUI.toast('Category added.');
    }
    KF.saveCategories(list);
    closeModal();
    render();
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const list = KF.getCategories();
    const cat = list.find((c) => c.id === id);
    if (!cat) return;

    if (btn.dataset.act === 'edit') openModal(cat);
    if (btn.dataset.act === 'delete') {
      const used = KF.getProducts().filter((p) => Number(p.categoryId) === id).length;
      if (used > 0) {
        KFUI.toast(`Cannot delete "${cat.name}": ${used} product${used > 1 ? 's' : ''} still use it.`, 'error');
        return;
      }
      if (!confirm(`Delete category "${cat.name}"?`)) return;
      KF.saveCategories(list.filter((c) => c.id !== id));
      KFUI.toast('Category deleted.', 'error');
      render();
    }
  });

  render();
})();
