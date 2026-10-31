/* Point of Sale: product grid, current order, checkout and receipt. */
(function () {
  const session = KF.getSession();
  const grid = document.getElementById('productGrid');
  const gridEmpty = document.getElementById('gridEmpty');
  const chips = document.getElementById('catChips');
  const search = document.getElementById('posSearch');
  const orderItems = document.getElementById('orderItems');
  const orderEmpty = document.getElementById('orderEmpty');
  const subtotalEl = document.getElementById('orderSubtotal');
  const taxEl = document.getElementById('orderTax');
  const totalEl = document.getElementById('orderTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  const checkoutModal = document.getElementById('checkoutModal');
  const checkoutForm = document.getElementById('checkoutForm');
  const dueAmount = document.getElementById('dueAmount');
  const servedBy = document.getElementById('servedBy');
  const paymentMethod = document.getElementById('paymentMethod');
  const customerName = document.getElementById('customerName');
  const checkoutError = document.getElementById('checkoutError');

  const doneModal = document.getElementById('doneModal');
  const doneOrderNo = document.getElementById('doneOrderNo');
  const donePaid = document.getElementById('donePaid');

  const TAX_RATE = 0;
  /** One barcode scan = one qty; wait before the same product can be scanned again. */
  const BARCODE_QTY_COOLDOWN_MS = 5000;
  let activeCat = 'all';
  let cart = [];            // [{ productId, qty }]
  let lastSale = null;
  const lastBarcodeAddAt = new Map();

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => 'GH ₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let productsById = new Map();
  function refreshProductCache() {
    productsById = new Map(KF.getProducts().map((p) => [Number(p.id), p]));
  }
  refreshProductCache();
  const productById = (id) => productsById.get(Number(id));
  const inCart = (id) => cart.find((c) => c.productId === Number(id));
  const isPacket = (p) => p.unit === 'packet' && Number(p.piecesPerPkt) > 1;

  function imageHtml(p, cls) {
    if (p.image) return `<img class="${cls}" src="${p.image}" alt="${esc(p.name)}" loading="lazy" decoding="async" />`;
    return `<div class="${cls} no-img"><i class="fa-solid fa-box"></i></div>`;
  }

  // ---------- Category chips ----------
  function renderChips() {
    const cats = KF.getCategories().slice().sort((a, b) => a.name.localeCompare(b.name));
    chips.innerHTML =
      `<button type="button" class="chip${activeCat === 'all' ? ' active' : ''}" data-cat="all">All</button>` +
      cats.map((c) => `<button type="button" class="chip${activeCat === String(c.id) ? ' active' : ''}" data-cat="${c.id}">${esc(c.name.toLowerCase())}</button>`).join('');
  }

  // ---------- Product grid ----------
  function renderGrid() {
    const q = search.value.trim().toLowerCase();
    const list = KF.getProducts()
      .filter((p) => activeCat === 'all' || String(p.categoryId) === activeCat)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    gridEmpty.hidden = list.length > 0;
    grid.innerHTML = list.map((p) => {
      const qty = Number(p.qty) || 0;
      const line = inCart(p.id);
      const out = qty <= 0;
      return `
        <button type="button" class="pcard${line ? ' selected' : ''}${out ? ' out' : ''}" data-id="${p.id}" ${out ? 'disabled' : ''}>
          <span class="pcard-qty ${qty < KF.LOW_STOCK_LIMIT ? 'low' : 'ok'}">${out ? 'Out of stock' : esc(KF.stockLabel(p))}</span>
          ${imageHtml(p, 'pcard-img')}
          <span class="pcard-name">${esc(p.name)}</span>
          <span class="pcard-price">${fmt(p.price)}</span>
          ${line ? `<span class="pcard-count">${line.qty}</span>` : ''}
        </button>`;
    }).join('');
  }

  function patchGridCard(id) {
    const p = productById(id);
    const el = grid.querySelector(`.pcard[data-id="${id}"]`);
    if (!p || !el) return false;
    const qty = Number(p.qty) || 0;
    const line = inCart(id);
    const out = qty <= 0;
    el.classList.toggle('selected', !!line);
    el.classList.toggle('out', out);
    el.disabled = out;
    const qtyEl = el.querySelector('.pcard-qty');
    if (qtyEl) {
      qtyEl.textContent = out ? 'Out of stock' : KF.stockLabel(p);
      qtyEl.classList.toggle('low', qty < KF.LOW_STOCK_LIMIT);
      qtyEl.classList.toggle('ok', qty >= KF.LOW_STOCK_LIMIT);
    }
    let countEl = el.querySelector('.pcard-count');
    if (line) {
      if (!countEl) {
        countEl = document.createElement('span');
        countEl.className = 'pcard-count';
        el.appendChild(countEl);
      }
      countEl.textContent = line.qty;
    } else if (countEl) countEl.remove();
    return true;
  }

  function afterCartChange(touchedIds) {
    renderCart({ instant: true });
    const ids = touchedIds && touchedIds.length ? touchedIds : cart.map((c) => c.productId);
    let needFull = false;
    ids.forEach((pid) => { if (!patchGridCard(pid)) needFull = true; });
    if (needFull) renderGrid();
  }

  // ---------- Cart ----------
  function cartTotals() {
    const subtotal = cart.reduce((s, c) => {
      const p = productById(c.productId);
      return s + (p ? c.qty * Number(p.price) : 0);
    }, 0);
    const tax = subtotal * TAX_RATE;
    return { subtotal, tax, total: subtotal + tax };
  }

  function renderCart(opts) {
    const instant = opts && opts.instant;
    // Drop anything whose product was deleted meanwhile.
    cart = cart.filter((c) => productById(c.productId));
    orderEmpty.hidden = cart.length > 0;
    orderItems.innerHTML = cart.map((c) => {
      const p = productById(c.productId);
      const packet = isPacket(p);
      return `
        <div class="order-item" data-id="${p.id}">
          ${imageHtml(p, 'order-thumb')}
          <div class="order-info">
            <div class="order-name">${esc(p.name)}</div>
            <div class="order-price">${fmt(p.price)}</div>
          </div>
          <button type="button" class="order-remove" data-act="remove" title="Remove">&times;</button>
          <div class="qty-ctl">
            <button type="button" data-act="dec" aria-label="Decrease">−</button>
            <span>${c.qty} ${packet ? (c.qty === 1 ? 'Pkt' : 'Pkts') : 'Qty'}</span>
            <button type="button" data-act="inc" aria-label="Increase" ${c.qty >= Number(p.qty) ? 'disabled' : ''}>+</button>
          </div>
          ${packet ? `<div class="order-pieces">(${(c.qty * Number(p.piecesPerPkt)).toLocaleString()} pieces)</div>` : ''}
        </div>`;
    }).join('');

    const t = cartTotals();
    const countOpts = { money: true, decimals: 2, prefix: 'GH ₵ ', duration: instant ? 0 : 280 };
    KFUI.countTo(subtotalEl, t.subtotal, countOpts);
    KFUI.countTo(taxEl, t.tax, countOpts);
    KFUI.countTo(totalEl, t.total, countOpts);
    checkoutBtn.disabled = cart.length === 0;
  }

  function addToCart(id, step = 1, announce) {
    const p = productById(id);
    if (!p) return false;
    const stock = Number(p.qty) || 0;
    const line = inCart(id);
    const have = line ? line.qty : 0;
    if (have + step > stock) {
      KFUI.toast(`Only ${KF.stockLabel(p)} of ${p.name} in the shop.`, 'error');
      return false;
    }
    if (line) line.qty += step;
    else cart.push({ productId: Number(id), qty: step });
    afterCartChange([Number(id)]);
    if (announce) KFUI.toast(`${p.name} added`);
    return true;
  }

  function looksLikeBarcode(s) {
    const t = KF.barcodeKey(s);
    if (t.length < 4) return false;
    const digits = (t.match(/\d/g) || []).length;
    if (t.length >= 8 && digits >= 4) return true;
    return digits >= 4 && digits / t.length >= 0.7;
  }

  function addFromBarcode(raw, { announce = true } = {}) {
    const code = String(raw || '').trim();
    if (!code) return false;
    const hit = KF.findProductByBarcode(code) ||
      KF.getProducts().find((p) => p.name.toLowerCase() === code.toLowerCase());
    if (!hit) {
      KFUI.toast('No product found for that barcode.', 'error');
      return false;
    }
    const now = Date.now();
    const last = lastBarcodeAddAt.get(hit.id) || 0;
    if (now - last < BARCODE_QTY_COOLDOWN_MS) {
      const waitSec = Math.ceil((BARCODE_QTY_COOLDOWN_MS - (now - last)) / 1000);
      KFUI.toast(`Wait ${waitSec}s before scanning ${hit.name} again.`, 'error');
      return false;
    }
    if (!addToCart(hit.id, 1, false)) return false;
    lastBarcodeAddAt.set(hit.id, now);
    if (announce) KFUI.toast(`${hit.name} added`);
    return true;
  }

  function applyBarcode(raw) {
    return addFromBarcode(raw, { announce: true });
  }

  function changeQty(id, delta) {
    const line = inCart(id);
    if (!line) return;
    if (delta > 0) return addToCart(id, 1);
    line.qty -= 1;
    if (line.qty <= 0) cart = cart.filter((c) => c.productId !== Number(id));
    afterCartChange([Number(id)]);
  }

  function removeLine(id) {
    cart = cart.filter((c) => c.productId !== Number(id));
    afterCartChange([Number(id)]);
  }

  function clearCart(silent) {
    if (cart.length === 0) return;
    cart = [];
    renderCart({ instant: true });
    renderGrid();
    if (!silent) KFUI.toast('Order cleared.');
  }

  // ---------- Track a completed order (view items, reprint receipt) ----------
  const trackModal = document.getElementById('trackModal');
  const trackOrderNo = document.getElementById('trackOrderNo');
  const trackError = document.getElementById('trackError');
  const trackDetails = document.getElementById('trackDetails');
  let trackedSale = null;

  const unitText = (l) => (l.unit === 'packet' && Number(l.piecesPerPkt) > 1 ? `Packet (${l.piecesPerPkt} pcs)` : 'Single');
  const itemCount = (s) => s.items.reduce((n, l) => n + l.qty, 0);

  function showTrackDetails(sale) {
    trackedSale = sale;
    trackError.hidden = true;
    document.getElementById('trackNo').textContent = sale.orderNo;
    document.getElementById('trackDate').textContent = KF.formatDateTime(sale.time);
    const status = document.getElementById('trackStatus');
    status.textContent = 'Completed';
    status.className = 'track-status ok';
    document.getElementById('trackCashier').textContent = sale.cashier;
    document.getElementById('trackCustomer').textContent = sale.customer || '—';
    document.getElementById('trackPayment').textContent = sale.payment || 'Cash';
    document.getElementById('trackQty').textContent = itemCount(sale);
    document.getElementById('trackItems').innerHTML = sale.items.map((l) => `
      <tr>
        <td>${esc(l.name)}</td>
        <td>${esc(unitText(l))}</td>
        <td>${l.qty}</td>
        <td>${fmt(l.price)}</td>
        <td>${fmt(l.qty * l.price)}</td>
      </tr>`).join('');
    document.getElementById('trackTotal').textContent = fmt(sale.total);
    trackDetails.hidden = false;
  }

  function openTrack(orderNo) {
    trackOrderNo.value = orderNo || '';
    trackError.hidden = true;
    trackDetails.hidden = true;
    trackedSale = null;
    KFUI.openModal(trackModal);
    if (orderNo) findTrackOrder();
    setTimeout(() => trackOrderNo.focus(), 50);
  }
  function closeTrack() {
    KFUI.closeModal(trackModal);
  }

  function findTrackOrder() {
    trackError.hidden = true;
    trackDetails.hidden = true;
    trackedSale = null;
    const no = trackOrderNo.value.trim().toUpperCase();
    if (!no) { trackError.textContent = 'Enter the order ID.'; trackError.hidden = false; return; }
    const sale = KF.getSales().find((s) => (s.orderNo || '').toUpperCase() === no) ||
      KF.getSales().find((s) => (s.orderNo || '').toUpperCase() === 'ORD-' + no);
    if (!sale) { trackError.textContent = `No order "${no}" was found.`; trackError.hidden = false; return; }
    showTrackDetails(sale);
  }

  const loginName = session.displayName || session.username;

  function paintServedBy() {
    const disp = document.getElementById('servedByDisplay');
    if (disp) disp.textContent = loginName;
    servedBy.value = loginName;
  }
  paintServedBy();

  function openCheckout() {
    if (cart.length === 0) return;
    checkoutError.hidden = true;
    checkoutForm.reset();
    paintServedBy();
    KFUI.countTo(dueAmount, cartTotals().total, { money: true, decimals: 2, prefix: 'GH ₵ ', duration: 0 });
    KFUI.openModal(checkoutModal);
    setTimeout(() => paymentMethod.focus(), 50);
  }
  function closeCheckout() {
    KFUI.closeModal(checkoutModal);
  }

  function confirmPayment(e) {
    e.preventDefault();
    checkoutError.hidden = true;
    const staffName = servedBy.value || loginName;

    // Final stock check – something may have sold from another window meanwhile.
    for (const c of cart) {
      const p = productById(c.productId);
      if (!p || c.qty > Number(p.qty)) {
        checkoutError.textContent = `${p ? p.name : 'An item'} no longer has enough stock. Adjust the order.`;
        checkoutError.hidden = false;
        refreshProductCache();
        afterCartChange(cart.map((c) => c.productId));
        return;
      }
    }

    const items = cart.map((c) => {
      const p = productById(c.productId);
      return { productId: p.id, categoryId: p.categoryId, name: p.name, qty: c.qty, price: Number(p.price), cost: Number(p.cost) || 0, unit: p.unit || 'single', piecesPerPkt: Number(p.piecesPerPkt) || 1 };
    });
    const t = cartTotals();
    lastSale = KF.recordSale({
      orderNo: KF.orderNumber(),
      time: new Date().toISOString(),
      cashier: staffName,
      soldBy: session.username,
      customer: customerName.value.trim(),
      payment: paymentMethod.value,
      items,
      subtotal: t.subtotal,
      tax: t.tax,
      total: t.total,
    });

    checkoutModal.hidden = true;
    checkoutModal.classList.remove('is-open', 'is-leaving');
    refreshProductCache();
    clearCart(true);
    setTimeout(() => { if (KFUI.refreshBell) KFUI.refreshBell(); }, 0);

    doneOrderNo.textContent = lastSale.orderNo;
    KFUI.countTo(donePaid, lastSale.total, { money: true, decimals: 2, prefix: 'GH₵', duration: 500 });
    KFUI.openModal(doneModal);
  }

  function closeDone() {
    KFUI.closeModal(doneModal);
    search.focus();
  }

  // ---------- Events ----------
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    activeCat = b.dataset.cat;
    renderChips();
    renderGrid();
  });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.pcard');
    if (card && !card.disabled) addToCart(card.dataset.id);
  });

  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGrid, 90);
  });
  // USB / Bluetooth scanners type the code then press Enter.
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    const code = search.value.trim();
    if (!code) return;
    const products = KF.getProducts();
    const exact = KF.findProductByBarcode(code) ||
      products.find((p) => p.name.toLowerCase() === code.toLowerCase());
    const visible = products.filter((p) => p.name.toLowerCase().includes(code.toLowerCase()) || KF.barcodeKey(p.barcode).includes(KF.barcodeKey(code)));
    const hit = exact || (visible.length === 1 ? visible[0] : null);
    if (hit) {
      const viaBarcode = !!exact || looksLikeBarcode(code);
      if (viaBarcode) addFromBarcode(code, { announce: true });
      else addToCart(hit.id, 1, true);
      search.value = '';
      renderGrid();
    } else {
      KFUI.toast('No product found for that code.', 'error');
    }
  });

  const posScanBtn = document.getElementById('posScanBtn');
  const posScanHint = document.getElementById('posScanHint');
  let scanHintTimer = 0;
  const mobileScanMq = window.matchMedia('(max-width: 900px)');

  function posUseInlineScan() {
    return mobileScanMq.matches;
  }

  function productForScanCode(raw) {
    const code = String(raw || '').trim();
    if (!code) return null;
    return KF.findProductByBarcode(code) ||
      KF.getProducts().find((p) => p.name.toLowerCase() === code.toLowerCase()) ||
      null;
  }

  function showScanHint(ok, text) {
    if (!posScanHint || !text) return;
    clearTimeout(scanHintTimer);
    posScanHint.hidden = false;
    posScanHint.className = `pos-scan-hint ${ok ? 'ok' : 'err'}`;
    posScanHint.textContent = text;
    scanHintTimer = setTimeout(() => { posScanHint.hidden = true; }, 4000);
  }

  function scrollProductIntoView(productId) {
    const card = grid.querySelector(`.pcard[data-id="${productId}"]`);
    if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function onPosScanCode(code) {
    const hit = productForScanCode(code);
    const ok = applyBarcode(code);
    if (posUseInlineScan()) {
      if (ok && hit) showScanHint(true, `Added: ${hit.name}`);
      else if (hit) showScanHint(false, `Wait before scanning ${hit.name} again.`);
      else showScanHint(false, 'No product found for this barcode.');
    }
    if (ok && hit) scrollProductIntoView(hit.id);
    return ok;
  }

  function posScannerOpts(extra) {
    const o = extra || {};
    return {
      title: 'Scan to add to order',
      continuous: true,
      onCode(code) { return onPosScanCode(code); },
      onClose() { posScanBtn.classList.remove('active'); },
      ...o,
    };
  }

  function syncMobileInlineScanner() {
    if (!posUseInlineScan()) {
      const inlineEl = document.getElementById('posInlineScan');
      if (inlineEl && !inlineEl.hidden && KFUI.scannerOpen && KFUI.scannerOpen()) {
        KFUI.closeScanner();
      }
      posScanBtn.classList.remove('active');
      return;
    }
    if (KFUI.scannerOpen && KFUI.scannerOpen()) return;
    posScanBtn.classList.add('active');
    KFUI.openScanner(posScannerOpts({ inline: '#posInlineScan' }));
  }

  posScanBtn.addEventListener('click', () => {
    if (posUseInlineScan()) {
      if (KFUI.scannerOpen && KFUI.scannerOpen()) {
        KFUI.closeScanner();
        return;
      }
      posScanBtn.classList.add('active');
      KFUI.openScanner(posScannerOpts({ inline: '#posInlineScan' }));
      return;
    }
    KFUI.openScanner(posScannerOpts());
  });

  if (typeof mobileScanMq.addEventListener === 'function') {
    mobileScanMq.addEventListener('change', syncMobileInlineScanner);
  } else if (typeof mobileScanMq.addListener === 'function') {
    mobileScanMq.addListener(syncMobileInlineScanner);
  }

  document.body.addEventListener('pointerdown', () => {
    if (KFUI.unlockScanAudio) KFUI.unlockScanAudio();
  }, { once: true, capture: true });

  // Hardware scanner while the search box is not focused (rapid key bursts).
  let scanBuf = '';
  let scanLast = 0;
  document.addEventListener('keydown', (e) => {
    if (KFUI.scannerOpen && KFUI.scannerOpen()) return;
    if (!checkoutModal.hidden || !doneModal.hidden || !trackModal.hidden) return;
    const now = performance.now();
    if (e.key === 'Enter') {
      const code = scanBuf;
      const gap = now - scanLast;
      scanBuf = '';
      if (!looksLikeBarcode(code) || gap > 140) return;
      e.preventDefault();
      onPosScanCode(code);
      if (document.activeElement === search) search.value = '';
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (now - scanLast > 100) scanBuf = '';
      scanBuf += e.key;
      scanLast = now;
    } else if (e.key !== 'Shift') {
      scanBuf = '';
    }
  }, true);

  orderItems.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.order-item').dataset.id;
    if (btn.dataset.act === 'inc') changeQty(id, 1);
    if (btn.dataset.act === 'dec') changeQty(id, -1);
    if (btn.dataset.act === 'remove') removeLine(id);
  });

  document.getElementById('clearOrderBtn').addEventListener('click', () => {
    if (cart.length === 0) { KFUI.toast('The order is already empty.', 'error'); return; }
    clearCart(false);
  });
  document.getElementById('trackOrderBtn').addEventListener('click', () => openTrack());
  document.getElementById('trackClose').addEventListener('click', closeTrack);
  trackModal.addEventListener('click', (e) => { if (e.target === trackModal) closeTrack(); });
  document.getElementById('trackFindBtn').addEventListener('click', findTrackOrder);
  trackOrderNo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findTrackOrder(); } });
  trackOrderNo.addEventListener('input', () => { trackDetails.hidden = true; trackedSale = null; });
  document.getElementById('trackPrintBtn').addEventListener('click', () => { if (trackedSale) KFReceipt.printReceipt(trackedSale); });

  // Opened from a sale notification: pos.html#order=ORD-XXXXXX
  function openFromHash() {
    const m = location.hash.match(/^#order=(.+)$/);
    if (m) openTrack(decodeURIComponent(m[1]));
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
  checkoutBtn.addEventListener('click', openCheckout);
  document.getElementById('checkoutClose').addEventListener('click', closeCheckout);
  checkoutModal.addEventListener('click', (e) => { if (e.target === checkoutModal) closeCheckout(); });
  checkoutForm.addEventListener('submit', confirmPayment);

  document.getElementById('printBtn').addEventListener('click', () => { if (lastSale) KFReceipt.printReceipt(lastSale); });
  document.getElementById('doneBtn').addEventListener('click', closeDone);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!checkoutModal.hidden) closeCheckout();
      else if (!doneModal.hidden) closeDone();
      else if (!trackModal.hidden) closeTrack();
    }
  });

  // Refresh when stock changes in another tab (e.g. a product edited on the Products page).
  function onCatalogChange() {
    refreshProductCache();
    renderChips();
    renderGrid();
    renderCart({ instant: true });
  }

  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.includes('kf_products') || e.key.includes('kf_categories')) onCatalogChange();
  });

  document.addEventListener('kf:sync', (e) => {
    const key = (e.detail && e.detail.key) || '*';
    if (key === 'sales' || key === 'staff' || key === 'users' || key === 'notifications' || key === 'shopName') return;
    if (key === 'categories' || key === '*') renderChips();
    if (key === 'products' || key === 'categories' || key === '*') onCatalogChange();
  });
  renderChips();
  renderGrid();
  renderCart({ instant: true });
  syncMobileInlineScanner();
  search.focus();
})();
