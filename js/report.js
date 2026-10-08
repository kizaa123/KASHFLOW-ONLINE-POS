/* Sales Report: date/category/cashier filters, summary cards, charts, detailed data,
   printing and Excel / PDF export of the items sold (tables only – no images or charts). */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => 'GH ₵ ' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = (n) => Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PALETTE = ['#8b5cf6', '#06b6d4', '#f97316', '#22c55e', '#ec4899', '#eab308', '#3b82f6', '#ef4444', '#14b8a6', '#a855f7'];
  const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00');
  const DAY = 86400000;

  const session = KF.getSession();
  const rangeSelect = document.getElementById('rangeSelect');
  const customRange = document.getElementById('customRange');
  const fromDate = document.getElementById('fromDate');
  const toDate = document.getElementById('toDate');
  const categorySelect = document.getElementById('categorySelect');
  const cashierSelect = document.getElementById('cashierSelect');
  const periodLabel = document.getElementById('periodLabel');
  const dataSearch = document.getElementById('dataSearch');
  const dataCount = document.getElementById('dataCount');
  const dataTable = document.getElementById('dataTable');
  const dataEmpty = document.getElementById('dataEmpty');
  const visualEmpty = document.getElementById('visualEmpty');

  let tab = 'visual';
  let view = 'lines';
  let current = { range: null, lines: [], sales: [] };
  const charts = {};
  let chartsDirty = true;

  // ---------- Lookups ----------
  const categories = KF.getCategories();
  const products = KF.getProducts();
  function categoryName(line) {
    let catId = line.categoryId;
    if (catId === undefined || catId === null) {
      const p = products.find((x) => x.id === line.productId);
      if (p) catId = p.categoryId;
    }
    const c = categories.find((x) => x.id === catId);
    return c ? c.name : 'Uncategorized';
  }

  // ---------- Date range ----------
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function rangeBounds() {
    const now = new Date();
    const t0 = startOfDay(now);
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (rangeSelect.value) {
      case 'today': return { start: t0, end: addDays(t0, 1), label: 'Today' };
      case 'yesterday': return { start: addDays(t0, -1), end: t0, label: 'Yesterday' };
      case 'week': return { start: addDays(t0, -6), end: addDays(t0, 1), label: 'Last 7 Days' };
      case 'lastMonth': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1), label: 'Last Month' };
      case 'year': return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: 'This Year' };
      case 'all': return { start: null, end: null, label: 'All Time' };
      case 'custom': {
        const start = fromDate.value ? new Date(fromDate.value + 'T00:00:00') : null;
        const end = toDate.value ? addDays(new Date(toDate.value + 'T00:00:00'), 1) : null;
        return { start, end, label: 'Custom Range' };
      }
      default: return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1), label: 'This Month' };
    }
  }

  function periodText(r) {
    if (!r.start && !r.end) return 'All Time';
    const endIncl = r.end ? addDays(r.end, -1) : null;
    if (r.start && endIncl && KF.dayKey(r.start) === KF.dayKey(endIncl)) return `${r.label} (${fmtDay(r.start)})`;
    return `${r.label} (${r.start ? fmtDay(r.start) : 'Beginning'} – ${endIncl ? fmtDay(endIncl) : 'Today'})`;
  }

  // ---------- Data ----------
  function buildLines() {
    const r = rangeBounds();
    const cat = categorySelect.value;
    const cashier = cashierSelect.value;
    const sales = KF.activeSales().filter((s) => {
      const t = new Date(s.time);
      if (r.start && t < r.start) return false;
      if (r.end && t >= r.end) return false;
      if (cashier !== 'all' && (s.cashier || '—') !== cashier) return false;
      return true;
    });
    const lines = [];
    sales.forEach((s) => {
      (s.items || []).forEach((l) => {
        const category = categoryName(l);
        if (cat !== 'all' && category !== cat) return;
        const qty = Number(l.qty) || 0;
        const price = Number(l.price) || 0;
        const cost = Number(l.cost) || 0;
        const per = Number(l.piecesPerPkt) || 1;
        lines.push({
          saleId: s.id,
          time: s.time,
          orderNo: s.orderNo || ('#' + s.id),
          item: l.name,
          category,
          qty,
          unit: l.unit === 'packet' && per > 1 ? `Packet (${per} pcs)` : 'Single',
          price,
          cost,
          total: qty * price,
          profit: qty * (price - cost),
          cashier: s.cashier || '—',
          payment: s.payment || 'Cash',
          customer: s.customer || '',
        });
      });
    });
    lines.sort((a, b) => new Date(b.time) - new Date(a.time));
    const used = new Set(lines.map((l) => l.saleId));
    return { range: r, lines, sales: sales.filter((s) => used.has(s.id)) };
  }

  // Groups lines by a key: { key -> { label, qty, total, profit, orders:Set } }
  function groupBy(lines, keyFn) {
    const map = new Map();
    lines.forEach((l) => {
      const key = keyFn(l);
      let g = map.get(key);
      if (!g) { g = { label: key, qty: 0, total: 0, profit: 0, orders: new Set() }; map.set(key, g); }
      g.qty += l.qty;
      g.total += l.total;
      g.profit += l.profit;
      g.orders.add(l.saleId);
    });
    return [...map.values()];
  }
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

  function summary(lines) {
    const items = groupBy(lines, (l) => l.item).sort((a, b) => b.qty - a.qty);
    return {
      revenue: sum(lines, (l) => l.total),
      profit: sum(lines, (l) => l.profit),
      orders: new Set(lines.map((l) => l.saleId)).size,
      items: sum(lines, (l) => l.qty),
      top: items[0] || null,
    };
  }

  // ---------- Filters ----------
  function fillFilters() {
    const allSales = KF.activeSales();
    const catNames = new Set(categories.map((c) => c.name));
    allSales.forEach((s) => (s.items || []).forEach((l) => catNames.add(categoryName(l))));
    categorySelect.innerHTML = '<option value="all">All Categories</option>' +
      [...catNames].sort((a, b) => a.localeCompare(b)).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

    const cashiers = [...new Set(allSales.map((s) => s.cashier || '—'))].sort((a, b) => a.localeCompare(b));
    cashierSelect.innerHTML = '<option value="all">All Cashiers</option>' +
      cashiers.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

    const now = new Date();
    fromDate.value = KF.dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
    toDate.value = KF.todayKey();
  }

  // ---------- Summary cards ----------
  function renderStats() {
    const s = summary(current.lines);
    KFUI.countTo(document.getElementById('rsRevenue'), s.revenue, { money: true, decimals: 2, prefix: 'GH ₵ ' });
    KFUI.countTo(document.getElementById('rsProfit'), s.profit, { money: true, decimals: 2, prefix: 'GH ₵ ' });
    KFUI.countTo(document.getElementById('rsOrders'), s.orders);
    document.getElementById('rsItems').textContent = `${s.items.toLocaleString()} item${s.items === 1 ? '' : 's'} sold`;
    document.getElementById('rsTop').textContent = s.top ? `${s.top.label} (${s.top.qty.toLocaleString()})` : '—';
    document.getElementById('rsTop').title = s.top ? `${s.top.label} – ${s.top.qty} sold, ${fmt(s.top.total)}` : '';
    periodLabel.innerHTML = `<i class="fa-regular fa-clock"></i> Showing <strong>${periodText(current.range)}</strong>` +
      (categorySelect.value !== 'all' ? ` · Category: <strong>${esc(categorySelect.value)}</strong>` : '') +
      (cashierSelect.value !== 'all' ? ` · Cashier: <strong>${esc(cashierSelect.value)}</strong>` : '');
  }

  // ---------- Charts ----------
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Hourly for a single day, daily up to ~2 months, monthly beyond that.
  function timeBuckets(r, lines) {
    let { start, end } = r;
    if (!start || !end) {
      if (!lines.length) return { labels: [], data: [] };
      const times = lines.map((l) => +new Date(l.time));
      start = start || startOfDay(new Date(Math.min(...times)));
      end = end || addDays(startOfDay(new Date(Math.max(...times))), 1);
    }
    const days = (end - start) / DAY;
    if (days <= 1) {
      const data = new Array(24).fill(0);
      lines.forEach((l) => { data[new Date(l.time).getHours()] += l.total; });
      return { labels: HOURS, data };
    }
    const labels = [];
    const keys = [];
    const totals = new Map();
    if (days <= 62) {
      lines.forEach((l) => { const k = KF.dayKey(l.time); totals.set(k, (totals.get(k) || 0) + l.total); });
      for (let d = new Date(start); d < end; d = addDays(d, 1)) {
        keys.push(KF.dayKey(d));
        labels.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
      }
    } else {
      const mk = (d) => `${d.getFullYear()}-${d.getMonth()}`;
      lines.forEach((l) => { const k = mk(new Date(l.time)); totals.set(k, (totals.get(k) || 0) + l.total); });
      for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        keys.push(mk(d));
        labels.push(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }));
      }
    }
    return { labels, data: keys.map((k) => totals.get(k) || 0) };
  }

  function destroyChart(name) {
    if (charts[name]) { charts[name].destroy(); charts[name] = null; }
  }

  function renderCharts() {
    const lines = current.lines;
    visualEmpty.hidden = lines.length > 0;
    if (typeof Chart === 'undefined') {
      document.querySelectorAll('.report-chart-wrap').forEach((w) => { w.innerHTML = '<p class="muted">Chart library could not load (no internet connection).</p>'; });
      return;
    }
    const textColor = cssVar('--text') || '#333';
    const gridColor = cssVar('--grid') || '#ddd';
    const money = (v) => 'GH₵' + Number(v).toLocaleString('en-GH', { maximumFractionDigits: 0 });

    // Revenue over time (line with gradient fill)
    const tb = timeBuckets(current.range, lines);
    destroyChart('revenue');
    charts.revenue = new Chart(document.getElementById('revenueChart'), {
      type: 'line',
      data: {
        labels: tb.labels,
        datasets: [{
          label: 'Revenue (GH₵)',
          data: tb.data,
          borderColor: '#8b5cf6',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: tb.labels.length > 40 ? 0 : 3,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#8b5cf6',
          pointBorderWidth: 2,
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            const area = chart.chartArea;
            if (!area) return 'rgba(139, 92, 246, 0.25)';
            const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
            g.addColorStop(1, 'rgba(139, 92, 246, 0)');
            return g;
          },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => ' ' + fmt(c.parsed.y) } },
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, font: { size: 10 }, callback: money }, grid: { color: gridColor } },
        },
      },
    });

    // Sales by category (doughnut)
    const cats = groupBy(lines, (l) => l.category).sort((a, b) => b.total - a.total);
    destroyChart('category');
    charts.category = new Chart(document.getElementById('categoryChart'), {
      type: 'doughnut',
      data: {
        labels: cats.map((c) => c.label),
        datasets: [{ data: cats.map((c) => c.total), backgroundColor: cats.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0, hoverOffset: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { position: 'top', labels: { color: textColor, boxWidth: 12, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
                return ` ${c.label}: ${fmt(c.parsed)} (${Math.round((c.parsed / total) * 100)}%)`;
              },
            },
          },
        },
      },
    });

    // Top selling items (horizontal bars by quantity)
    const top = groupBy(lines, (l) => l.item).sort((a, b) => b.qty - a.qty).slice(0, 5);
    destroyChart('top');
    charts.top = new Chart(document.getElementById('topChart'), {
      type: 'bar',
      data: {
        labels: top.map((t) => t.label),
        datasets: [{ label: 'Quantity sold', data: top.map((t) => t.qty), backgroundColor: top.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 4, barPercentage: 0.7 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.parsed.x} sold · ${fmt(top[c.dataIndex].total)}` } },
        },
        scales: {
          x: { beginAtZero: true, ticks: { color: textColor, font: { size: 10 }, precision: 0 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    // Payment methods and cashier breakdown tables
    renderMiniTable('paymentTable', groupBy(lines, (l) => l.payment).sort((a, b) => b.total - a.total));
    renderMiniTable('cashierTable', groupBy(lines, (l) => l.cashier).sort((a, b) => b.total - a.total));
    chartsDirty = false;
  }

  function renderMiniTable(id, groups) {
    const body = document.querySelector(`#${id} tbody`);
    if (!groups.length) { body.innerHTML = '<tr><td class="mt-empty">No sales in this period.</td></tr>'; return; }
    const max = Math.max(...groups.map((g) => g.total)) || 1;
    body.innerHTML = groups.map((g) => `
      <tr>
        <td class="mt-label">${esc(g.label)}</td>
        <td class="mt-count">${g.orders.size} order${g.orders.size === 1 ? '' : 's'}</td>
        <td class="mt-amt">${fmt(g.total)}</td>
        <td class="mt-bar"><div><span style="width:${Math.round((g.total / max) * 100)}%"></span></div></td>
      </tr>`).join('');
  }

  // ---------- Detailed data ----------
  function searchedLines() {
    const q = dataSearch.value.trim().toLowerCase();
    if (!q) return current.lines;
    return current.lines.filter((l) =>
      l.item.toLowerCase().includes(q) || l.orderNo.toLowerCase().includes(q) ||
      l.cashier.toLowerCase().includes(q) || l.category.toLowerCase().includes(q));
  }

  function renderTable() {
    const lines = searchedLines();
    const head = dataTable.querySelector('thead');
    const body = dataTable.querySelector('tbody');
    const foot = dataTable.querySelector('tfoot');
    dataEmpty.hidden = lines.length > 0;
    const totalQty = sum(lines, (l) => l.qty);
    const totalAmt = sum(lines, (l) => l.total);
    const totalProfit = sum(lines, (l) => l.profit);

    if (view === 'lines') {
      dataCount.textContent = `${lines.length.toLocaleString()} line${lines.length === 1 ? '' : 's'} · ${new Set(lines.map((l) => l.saleId)).size} order(s)`;
      head.innerHTML = '<tr><th>Date &amp; Time</th><th>Order No</th><th class="left">Item</th><th>Category</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Cashier</th></tr>';
      body.innerHTML = lines.map((l) => `
        <tr>
          <td class="muted-cell">${esc(KF.formatDateTime(l.time))}</td>
          <td>${l.orderNo.startsWith('ORD-') ? `<a class="order-link" href="pos.html#order=${encodeURIComponent(l.orderNo)}" title="Open in Track Order">${esc(l.orderNo)}</a>` : esc(l.orderNo)}</td>
          <td class="left strong">${esc(l.item)}</td>
          <td>${esc(l.category)}</td>
          <td class="muted-cell">${esc(l.unit)}</td>
          <td class="strong">${l.qty.toLocaleString()}</td>
          <td class="money">${fmt(l.price)}</td>
          <td class="money total">${fmt(l.total)}</td>
          <td>${esc(l.cashier)}</td>
        </tr>`).join('');
      foot.innerHTML = lines.length ? `<tr><td colspan="5" class="left">Totals</td><td>${totalQty.toLocaleString()}</td><td></td><td class="money total">${fmt(totalAmt)}</td><td></td></tr>` : '';
    } else {
      const items = groupBy(lines, (l) => l.item).sort((a, b) => b.total - a.total);
      const catOf = new Map(lines.map((l) => [l.item, l.category]));
      dataCount.textContent = `${items.length.toLocaleString()} product${items.length === 1 ? '' : 's'} · ${totalQty.toLocaleString()} item(s) sold`;
      head.innerHTML = '<tr><th>#</th><th class="left">Item</th><th>Category</th><th>Qty Sold</th><th>Orders</th><th>Revenue</th><th>Profit</th><th>Share of Revenue</th></tr>';
      body.innerHTML = items.map((g, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td class="left strong">${esc(g.label)}</td>
          <td>${esc(catOf.get(g.label) || '—')}</td>
          <td class="strong">${g.qty.toLocaleString()}</td>
          <td>${g.orders.size}</td>
          <td class="money total">${fmt(g.total)}</td>
          <td class="money profit">${fmt(g.profit)}</td>
          <td><div class="share"><div><span style="width:${totalAmt ? Math.round((g.total / totalAmt) * 100) : 0}%"></span></div><small>${totalAmt ? Math.round((g.total / totalAmt) * 100) : 0}%</small></div></td>
        </tr>`).join('');
      foot.innerHTML = items.length ? `<tr><td colspan="3" class="left">Totals</td><td>${totalQty.toLocaleString()}</td><td>${new Set(lines.map((l) => l.saleId)).size}</td><td class="money total">${fmt(totalAmt)}</td><td class="money profit">${fmt(totalProfit)}</td><td>100%</td></tr>` : '';
    }
  }

  // ---------- Export dataset (shared by print, Excel and PDF) ----------
  function exportDataset() {
    const lines = searchedLines();
    const s = summary(lines);
    const items = groupBy(lines, (l) => l.item).sort((a, b) => b.total - a.total);
    const catOf = new Map(lines.map((l) => [l.item, l.category]));
    const chrono = lines.slice().sort((a, b) => new Date(a.time) - new Date(b.time));
    return {
      shop: KF.getShopName(),
      period: periodText(current.range),
      category: categorySelect.value === 'all' ? 'All Categories' : categorySelect.value,
      cashier: cashierSelect.value === 'all' ? 'All Cashiers' : cashierSelect.value,
      search: dataSearch.value.trim(),
      generated: KF.formatDateTime(new Date().toISOString()),
      by: session ? (session.displayName || session.username) : '',
      summary: s,
      header: ['Date & Time', 'Order No', 'Item', 'Category', 'Unit', 'Qty', 'Unit Price (GHS)', 'Total (GHS)', 'Cashier', 'Payment'],
      rows: chrono.map((l) => [KF.formatDateTime(l.time), l.orderNo, l.item, l.category, l.unit, l.qty, round2(l.price), round2(l.total), l.cashier, l.payment]),
      dates: chrono.map((l) => splitDateTime(l.time)),
      totals: ['Totals', '', '', '', '', s.items, '', round2(s.revenue), '', ''],
      itemsHeader: ['#', 'Item', 'Category', 'Qty Sold', 'Orders', 'Revenue (GHS)', 'Profit (GHS)'],
      itemsRows: items.map((g, i) => [i + 1, g.label, catOf.get(g.label) || '', g.qty, g.orders.size, round2(g.total), round2(g.profit)]),
      itemsTotals: ['', 'Totals', '', s.items, s.orders, round2(s.revenue), round2(s.profit)],
    };
  }
  const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  function fileName(ext) {
    const shop = KF.getShopName().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'KASHFLOW';
    return `${shop}-Sales-Report-${KF.todayKey()}.${ext}`;
  }

  // Date on top, time underneath – used on the printed / PDF table.
  function splitDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return { date: '—', time: '' };
    return {
      date: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    };
  }

  // ---------- Lazy-loaded export libraries ----------
  const LIBS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  };
  const loaded = {};
  function ensure(lib) {
    if (!loaded[lib]) {
      loaded[lib] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = LIBS[lib];
        s.onload = resolve;
        s.onerror = () => { delete loaded[lib]; reject(new Error('load failed')); };
        document.head.appendChild(s);
      });
    }
    return loaded[lib];
  }
  function setBusy(btn, busy) {
    btn.disabled = busy;
    if (busy) { btn.dataset.html = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Working…'; }
    else if (btn.dataset.html) { btn.innerHTML = btn.dataset.html; }
  }

  // ---------- Excel ----------
  async function exportExcel() {
    const d = exportDataset();
    if (!d.rows.length) { KFUI.toast('There are no items sold to export.', 'error'); return; }
    const btn = document.getElementById('excelBtn');
    setBusy(btn, true);
    try {
      await ensure('xlsx');
    } catch (e) {
      setBusy(btn, false);
      downloadCsv(d);
      KFUI.toast('Excel library could not load – saved as CSV instead (opens in Excel).');
      return;
    }
    setBusy(btn, false);

    const title = [
      [`${d.shop} – Sales Report`],
      [`Period: ${d.period}`],
      [`Category: ${d.category}   |   Cashier: ${d.cashier}${d.search ? `   |   Search: "${d.search}"` : ''}`],
      [`Generated: ${d.generated}${d.by ? ` by ${d.by}` : ''}`],
      [],
      ['Total Revenue (GHS)', round2(d.summary.revenue), 'Total Profit (GHS)', round2(d.summary.profit), 'Orders', d.summary.orders, 'Items Sold', d.summary.items],
      [],
    ];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([...title, d.header, ...d.rows, [], d.totals]);
    ws1['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 7 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Items Sold');

    const ws2 = XLSX.utils.aoa_to_sheet([...title, d.itemsHeader, ...d.itemsRows, [], d.itemsTotals]);
    ws2['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary by Item');

    XLSX.writeFile(wb, fileName('xlsx'));
    KFUI.toast(`Exported ${d.rows.length} item line(s) to Excel.`);
  }

  function downloadCsv(d) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      [`${d.shop} – Sales Report`], [`Period: ${d.period}`], [`Category: ${d.category} | Cashier: ${d.cashier}`], [`Generated: ${d.generated}`], [],
      d.header, ...d.rows, [], d.totals,
    ].map((r) => r.map(q).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName('csv');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- PDF ----------
  async function exportPdf() {
    const d = exportDataset();
    if (!d.rows.length) { KFUI.toast('There are no items sold to export.', 'error'); return; }
    const btn = document.getElementById('pdfBtn');
    setBusy(btn, true);
    try {
      await ensure('jspdf');
      await ensure('autotable');
    } catch (e) {
      setBusy(btn, false);
      printReport();
      KFUI.toast('PDF library could not load – choose "Save as PDF" in the print dialog.');
      return;
    }
    setBusy(btn, false);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const left = 40;
    const pageRight = 555;
    const money = (n) => 'GHS ' + plain(n);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17, 24, 39);
    doc.text(d.shop.toUpperCase(), left, 46);
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Sales Report', left, 64);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(`Period: ${d.period}`, left, 80);
    doc.text(`Category: ${d.category}    Cashier: ${d.cashier}${d.search ? `    Search: "${d.search}"` : ''}`, left, 92);
    doc.text(`Generated: ${d.generated}${d.by ? ` by ${d.by}` : ''}`, left, 104);

    doc.setDrawColor(203, 213, 225);
    doc.line(left, 112, pageRight, 112);

    // Stacked totals with dotted leaders, matching:
    // Total Revenue: ..........GHS 826.00
    const leaderRight = left + 260;
    function dottedRow(y, label, value) {
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'normal');
      const lw = doc.getTextWidth(label);
      doc.setFont('helvetica', 'bold');
      const vw = doc.getTextWidth(value);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const gapStart = left + lw + 3;
      const gapEnd = leaderRight - vw - 4;
      for (let x = gapStart; x < gapEnd; x += 3.2) doc.text('.', x, y);
      doc.setTextColor(17, 24, 39);
      doc.text(label, left, y);
      doc.setFont('helvetica', 'bold');
      doc.text(value, leaderRight, y, { align: 'right' });
    }
    dottedRow(132, 'Total Revenue:', money(d.summary.revenue));
    dottedRow(150, 'Total Profit:', money(d.summary.profit));
    dottedRow(168, 'Orders:', String(d.summary.orders));
    dottedRow(186, 'Total Sold:', String(d.summary.items));
    dottedRow(204, 'Top Selling:', d.summary.top ? d.summary.top.label : '—');

    const right = { halign: 'right', valign: 'middle' };
    const common = {
      styles: {
        fontSize: 8,
        cellPadding: { top: 7, bottom: 7, left: 5, right: 5 },
        textColor: [17, 24, 39],
        lineColor: [203, 213, 225],
        lineWidth: 0.4,
        valign: 'middle',
        overflow: 'linebreak',
        minCellHeight: 28,
      },
      headStyles: { fillColor: false, textColor: [0, 0, 0], fontStyle: 'bold', valign: 'middle', cellPadding: { top: 8, bottom: 8, left: 5, right: 5 } },
      footStyles: { fillColor: [241, 245, 249], textColor: [17, 24, 39], fontStyle: 'bold', valign: 'middle' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left, right: 40 },
    };
    const body = d.rows.map((r, i) => {
      const dt = d.dates[i] || { date: String(r[0]), time: '' };
      return [`${dt.date}\n${dt.time}`, ...r.slice(1).map((v, idx) => (idx === 5 || idx === 6 ? plain(v) : String(v)))];
    });
    doc.autoTable({
      ...common,
      startY: 220,
      head: [d.header],
      body,
      foot: [d.totals.map((v, i) => (i === 7 ? plain(v) : String(v)))],
      columnStyles: {
        0: { cellWidth: 72, halign: 'center', valign: 'middle', fontSize: 7.5 },
        5: right, 6: right, 7: right,
      },
    });

    let y = doc.lastAutoTable.finalY + 28;
    if (y > 720) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('Summary by Item', left, y);
    doc.autoTable({
      ...common,
      startY: y + 10,
      head: [d.itemsHeader],
      body: d.itemsRows.map((r) => r.map((v, i) => (i === 5 || i === 6 ? plain(v) : String(v)))),
      foot: [d.itemsTotals.map((v, i) => (i === 5 || i === 6 ? plain(v) : String(v)))],
      columnStyles: { 0: { cellWidth: 24 }, 3: right, 4: right, 5: right, 6: right },
    });

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(`${d.shop} · Sales Report · ${d.period}`, left, 820);
      doc.text(`Page ${i} of ${pages}`, pageRight, 820, { align: 'right' });
    }
    doc.save(fileName('pdf'));
    KFUI.toast(`Exported ${d.rows.length} item line(s) to PDF.`);
  }

  // ---------- Print (clean document: summary + items table, no charts or images) ----------
  function reportHtml(d) {
    const cell = (v, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${esc(v)}</td>`;
    const dtCell = (i) => {
      const dt = d.dates[i] || { date: d.rows[i][0], time: '' };
      return `<td class="dt"><span class="d">${esc(dt.date)}</span><span class="t">${esc(dt.time)}</span></td>`;
    };
    const rows = d.rows.map((r, i) => `<tr>${dtCell(i)}${cell(r[1], 'mono')}${cell(r[2], 'left')}${cell(r[3])}${cell(r[4])}${cell(r[5], 'r')}${cell(plain(r[6]), 'r')}${cell(plain(r[7]), 'r')}${cell(r[8])}${cell(r[9])}</tr>`).join('');
    const itemRows = d.itemsRows.map((r) => `<tr>${cell(r[0])}${cell(r[1], 'left')}${cell(r[2])}${cell(r[3], 'r')}${cell(r[4], 'r')}${cell(plain(r[5]), 'r')}${cell(plain(r[6]), 'r')}</tr>`).join('');
    const leader = (label, value) => `<div class="leader"><span class="ll">${esc(label)}</span><span class="dots"></span><span class="lv">${esc(value)}</span></div>`;
    const money = (n) => 'GHS ' + plain(n);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(d.shop)} - Sales Report</title>
<style>
  @page { margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11px; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 13px; margin: 2px 0 10px; color: #1e293b; }
  h3 { font-size: 12px; margin: 22px 0 8px; color: #1e293b; }
  .meta { color: #4b5563; font-size: 10px; line-height: 1.6; }
  .leaders { width: 280px; margin: 12px 0 16px; }
  .leader { display: flex; align-items: baseline; gap: 4px; margin: 5px 0; font-size: 11px; }
  .leader .ll { white-space: nowrap; }
  .leader .dots { flex: 1; overflow: hidden; white-space: nowrap; color: #64748b; letter-spacing: 1.5px; font-size: 11px; line-height: 1; }
  .leader .dots::before { content: ".................................................."; }
  .leader .lv { font-weight: 700; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 8px; text-align: center; font-size: 10px; vertical-align: middle; }
  th { background: none; background-color: transparent; color: #000; font-weight: 800; }
  td.left, th.left { text-align: left; }
  td.r { text-align: right; }
  td.mono { font-weight: 700; color: #15803d; }
  td.dt .d { display: block; font-weight: 700; }
  td.dt .t { display: block; font-size: 9px; color: #4b5563; margin-top: 2px; }
  tfoot td { font-weight: 800; background: #f1f5f9; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 14px; font-size: 9px; color: #6b7280; text-align: center; }
</style></head>
<body>
  <h1>${esc(d.shop.toUpperCase())}</h1>
  <h2>Sales Report</h2>
  <div class="meta">
    Period: <b>${esc(d.period)}</b><br />
    Category: ${esc(d.category)} &nbsp;|&nbsp; Cashier: ${esc(d.cashier)}${d.search ? ` &nbsp;|&nbsp; Search: "${esc(d.search)}"` : ''}<br />
    Generated: ${esc(d.generated)}${d.by ? ` by ${esc(d.by)}` : ''}
  </div>
  <div class="leaders">
    ${leader('Total Revenue:', money(d.summary.revenue))}
    ${leader('Total Profit:', money(d.summary.profit))}
    ${leader('Orders:', String(d.summary.orders))}
    ${leader('Total Sold:', String(d.summary.items))}
    ${leader('Top Selling:', d.summary.top ? d.summary.top.label : '—')}
  </div>
  <table>
    <thead><tr><th>Date &amp; Time</th><th>Order No</th><th class="left">Item</th><th>Category</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Cashier</th><th>Payment</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="10">No items sold in this period.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="5" class="left">Totals</td><td class="r">${d.summary.items}</td><td></td><td class="r">GH₵${plain(d.summary.revenue)}</td><td></td><td></td></tr></tfoot>
  </table>
  <h3>Summary by Item</h3>
  <table>
    <thead><tr><th>#</th><th class="left">Item</th><th>Category</th><th>Qty Sold</th><th>Orders</th><th>Revenue</th><th>Profit</th></tr></thead>
    <tbody>${itemRows || '<tr><td colspan="7">No items sold in this period.</td></tr>'}</tbody>
    <tfoot><tr><td></td><td class="left">Totals</td><td></td><td class="r">${d.summary.items}</td><td class="r">${d.summary.orders}</td><td class="r">GH₵${plain(d.summary.revenue)}</td><td class="r">GH₵${plain(d.summary.profit)}</td></tr></tfoot>
  </table>
  <p class="foot">${esc(d.shop)} · Sales Report · Generated by KASHFLOW</p>
</body></html>`;
  }

  function printReport() {
    const d = exportDataset();
    const old = document.getElementById('reportFrame');
    if (old) old.remove();
    const frame = document.createElement('iframe');
    frame.id = 'reportFrame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(reportHtml(d));
    doc.close();
    const go = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* ignore */ } };
    if (doc.readyState === 'complete') setTimeout(go, 150);
    else frame.onload = () => setTimeout(go, 150);
  }

  // ---------- Orchestration ----------
  function apply() {
    current = buildLines();
    renderStats();
    renderTable();
    chartsDirty = true;
    if (tab === 'visual') renderCharts();
  }

  function showTab(name) {
    tab = name;
    document.querySelectorAll('#reportTabs .report-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.getElementById('tabVisual').hidden = name !== 'visual';
    document.getElementById('tabData').hidden = name !== 'data';
    if (name === 'visual' && chartsDirty) renderCharts();
  }

  rangeSelect.addEventListener('change', () => {
    customRange.hidden = rangeSelect.value !== 'custom';
    apply();
  });
  fromDate.addEventListener('change', apply);
  toDate.addEventListener('change', apply);
  categorySelect.addEventListener('change', apply);
  cashierSelect.addEventListener('change', apply);
  dataSearch.addEventListener('input', renderTable);

  document.getElementById('reportTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.report-tab');
    if (b) showTab(b.dataset.tab);
  });
  document.getElementById('viewChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    view = chip.dataset.view;
    document.querySelectorAll('#viewChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderTable();
  });

  document.getElementById('printBtn').addEventListener('click', printReport);
  document.getElementById('excelBtn').addEventListener('click', exportExcel);
  document.getElementById('pdfBtn').addEventListener('click', exportPdf);

  document.addEventListener('kf:themechange', () => { chartsDirty = true; if (tab === 'visual') renderCharts(); });
  window.addEventListener('storage', (e) => { if (e.key === KF.KEYS.sales) apply(); });

  fillFilters();
  apply();
})();
