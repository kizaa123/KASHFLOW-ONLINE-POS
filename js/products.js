/* Products page: list, search, add/edit/delete, barcode generator, image upload. */
(function () {
  const body = document.getElementById('productBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');

  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const title = document.getElementById('modalTitle');
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('formError');

  const f = {
    id: document.getElementById('productId'),
    barcode: document.getElementById('barcode'),
    name: document.getElementById('productName'),
    image: document.getElementById('productImage'),
    preview: document.getElementById('imagePreview'),
    removeImage: document.getElementById('removeImageBtn'),
    category: document.getElementById('category'),
    cost: document.getElementById('costPrice'),
    price: document.getElementById('sellPrice'),
    qty: document.getElementById('stockQty'),
    unit: document.getElementById('unit'),
    pieces: document.getElementById('piecesPerPkt'),
  };
  let imageData = null; // data URL of the chosen image
  let sort = 'newest';
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'GH ₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function categoryName(id) {
    const c = KF.getCategories().find((x) => String(x.id) === String(id));
    return c ? c.name : '—';
  }

  // ---------- Table ----------
  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const all = KF.getProducts();
    const list = all.filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        String(p.barcode).toLowerCase().includes(q) ||
        categoryName(p.categoryId).toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      switch (sort) {
        case 'oldest': return a.id - b.id;
        case 'az': return a.name.localeCompare(b.name);
        case 'za': return b.name.localeCompare(a.name);
        case 'low': return Number(a.qty) - Number(b.qty);
        case 'high': return Number(b.qty) - Number(a.qty);
        case 'price-asc': return Number(a.price) - Number(b.price);
        case 'price-desc': return Number(b.price) - Number(a.price);
        default: return b.id - a.id; // newest
      }
    });

    emptyState.hidden = list.length > 0;

    body.innerHTML = list
      .map((p) => {
        const low = Number(p.qty) < KF.LOW_STOCK_LIMIT;
        const img = p.image
          ? `<img src="${p.image}" alt="${esc(p.name)}" />`
          : `<i class="fa-solid fa-box placeholder"></i>`;
        return `
          <tr data-id="${p.id}">
            <td><div class="thumb">${img}</div></td>
            <td><span class="barcode">${esc(p.barcode)}</span></td>
            <td class="strong">${esc(p.name)}</td>
            <td>${esc(categoryName(p.categoryId))}</td>
            <td class="strong">${money(p.price)}</td>
            <td><span class="stock-badge ${low ? 'low' : 'ok'}">${esc(KF.stockLabel(p))}</span></td>
            <td>
              <div class="row-actions">
                <button class="act edit" data-act="edit" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="act del" data-act="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </td>
          </tr>`;
      })
      .join('');
  }

  // ---------- Modal helpers ----------
  function fillSelects() {
    f.category.innerHTML =
      '<option value="">Select category</option>' +
      KF.getCategories().map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  function setPreview(src) {
    imageData = src || null;
    f.preview.innerHTML = src
      ? `<img src="${src}" alt="Product image" /><span class="hint overlay"><i class="fa-solid fa-camera"></i> Change</span>`
      : '<i class="fa-regular fa-image"></i><span class="hint">Click to add image</span>';
    f.preview.classList.toggle('has-image', !!src);
    f.removeImage.hidden = !src;
  }

  function openModal(product) {
    fillSelects();
    errEl.hidden = true;
    form.reset();
    f.image.value = '';

    if (product) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Product';
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Changes';
      f.id.value = product.id;
      f.barcode.value = product.barcode;
      f.name.value = product.name;
      f.category.value = product.categoryId || '';
      f.cost.value = product.cost;
      f.price.value = product.price;
      f.qty.value = product.qty;
      f.unit.value = product.unit || 'single';
      f.pieces.value = product.piecesPerPkt || 1;
      setPreview(product.image);
    } else {
      title.innerHTML = '<i class="fa-solid fa-cart-plus"></i> New Product';
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Product';
      f.id.value = '';
      f.barcode.value = '';
      f.unit.value = 'single';
      f.pieces.value = 1;
      setPreview(null);
    }
    syncUnit();
    KFUI.openModal(modal);
    setTimeout(() => (product ? f.name : f.barcode).focus(), 50);
  }

  function closeModal() {
    if (KFUI.scannerOpen && KFUI.scannerOpen()) KFUI.closeScanner();
    KFUI.closeModal(modal);
  }

  function syncUnit() {
    const packet = f.unit.value === 'packet';
    f.pieces.disabled = !packet;
    if (!packet) f.pieces.value = 1;
    else if (Number(f.pieces.value) < 2) f.pieces.value = '';
  }

  // Shrink the picked image so it fits comfortably in local storage.
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const MAX = 220;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
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
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  // ---------- Events ----------
  document.getElementById('addProductBtn').addEventListener('click', () => openModal(null));
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

  f.unit.addEventListener('change', syncUnit);

  f.barcode.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    f.name.focus();
  });

  document.getElementById('scanBarcodeBtn').addEventListener('click', () => {
    KFUI.openScanner({
      title: 'Scan product barcode',
      onCode(code) {
        f.barcode.value = String(code).trim();
        f.name.focus();
      },
    });
  });

  // Spinning barcode generator for items that have no printed barcode
  const genBtn = document.getElementById('genBarcodeBtn');
  genBtn.addEventListener('click', () => {
    genBtn.classList.add('spinning');
    genBtn.disabled = true;
    setTimeout(() => {
      let code = KF.generateBarcode();
      const taken = new Set(KF.getProducts().map((p) => p.barcode));
      while (taken.has(code)) code = KF.generateBarcode();
      f.barcode.value = code;
      genBtn.classList.remove('spinning');
      genBtn.disabled = false;
    }, 600);
  });

  f.preview.addEventListener('click', () => f.image.click());
  f.image.addEventListener('change', async () => {
    const file = f.image.files[0];
    if (!file) return;
    try { setPreview(await readImage(file)); }
    catch (e) { showError('Could not read that image file.'); }
  });
  f.removeImage.addEventListener('click', () => { f.image.value = ''; setPreview(null); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.hidden = true;

    const barcode = f.barcode.value.trim().replace(/\s+/g, '');
    const name = f.name.value.trim();
    const categoryId = f.category.value;
    const cost = parseFloat(f.cost.value);
    const price = parseFloat(f.price.value);
    const qty = parseInt(f.qty.value, 10);
    const unit = f.unit.value;
    const pieces = unit === 'packet' ? parseInt(f.pieces.value, 10) : 1;

    if (!barcode) return showError('Scan, type, or generate the product barcode.');
    if (barcode.length < 3) return showError('That barcode is too short.');
    if (!name) return showError('Enter the product name.');
    if (!categoryId) return showError('Choose a category.');
    if (isNaN(cost) || cost < 0) return showError('Enter a valid cost price.');
    if (isNaN(price) || price < 0) return showError('Enter a valid sell price.');
    if (isNaN(qty) || qty < 0) return showError('Enter the stock quantity.');
    if (unit === 'packet' && (isNaN(pieces) || pieces < 2)) return showError('Enter how many pieces are in one packet.');

    const list = KF.getProducts();
    const editingId = f.id.value ? Number(f.id.value) : null;
    if (list.some((p) => KF.barcodeKey(p.barcode) === KF.barcodeKey(barcode) && p.id !== editingId)) {
      return showError('That barcode is already used by another product.');
    }

    const data = {
      barcode, name, categoryId: Number(categoryId),
      cost, price, qty, unit, piecesPerPkt: pieces, image: imageData,
    };

    if (editingId) {
      const idx = list.findIndex((p) => p.id === editingId);
      list[idx] = { ...list[idx], ...data };
      KFUI.toast('Product updated.');
    } else {
      list.push({ id: KF.nextId(list), ...data });
      KFUI.toast('Product added.');
    }

    try { KF.saveProducts(list); }
    catch (err) { return showError('Storage is full. Try a smaller image.'); }

    KF.notify({
      type: 'product',
      title: editingId ? 'Product updated' : 'Product loaded',
      message: `${name} ${editingId ? 'was updated' : 'was added to the shop'} with ${KF.stockLabel(data)} in stock.`,
      link: 'products.html',
    });

    closeModal();
    render();
    KFUI.refreshBell();
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const list = KF.getProducts();
    const product = list.find((p) => p.id === id);
    if (!product) return;

    if (btn.dataset.act === 'edit') openModal(product);
    if (btn.dataset.act === 'delete') {
      if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
      KF.saveProducts(list.filter((p) => p.id !== id));
      KFUI.toast('Product deleted.', 'error');
      render();
      KFUI.refreshBell();
    }
  });

  document.addEventListener('kf:sync', render);
  render();
})();
