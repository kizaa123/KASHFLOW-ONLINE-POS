/* Receipt: builds the printable sales receipt and sends it to the printer. */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const amt = (n) => 'GH₵' + Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Draws a barcode-style strip from the order number (visual, like the original receipt).
  function barcodeDataUrl(text) {
    const canvas = document.createElement('canvas');
    const bits = [];
    // Start guard, data bars derived from the characters, end guard.
    bits.push(1, 0, 1);
    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      for (let i = 6; i >= 0; i--) bits.push((code >> i) & 1);
      bits.push(0);
    }
    bits.push(1, 0, 1);
    const unit = 2;
    canvas.width = bits.length * unit;
    canvas.height = 44;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    bits.forEach((b, i) => { if (b) ctx.fillRect(i * unit, 0, unit, canvas.height); });
    return canvas.toDataURL('image/png');
  }

  function unitLabel(line) {
    const per = Number(line.piecesPerPkt) || 1;
    if (line.unit === 'packet' && per > 1) return `Packet (${per} pcs)`;
    return 'Single';
  }
  function qtyLabel(line) {
    const per = Number(line.piecesPerPkt) || 1;
    if (line.unit === 'packet' && per > 1) return `${line.qty}<br><small>(${line.qty * per} Pcs)</small>`;
    return String(line.qty);
  }

  function receiptHtml(sale) {
    const rows = sale.items.map((l) => `
      <tr>
        <td class="item">${esc(l.name)}</td>
        <td class="unit">${esc(unitLabel(l))}</td>
        <td class="qty">${qtyLabel(l)}</td>
        <td class="tot">${Number(l.qty * l.price).toFixed(2)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(sale.orderNo)} - Receipt</title>
<style>
  @page { margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; display: flex; justify-content: center; }
  .receipt { width: 300px; padding: 10px 6px; font-size: 11px; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; letter-spacing: 0.3px; }
  .sub { text-align: center; color: #6b7280; font-size: 10px; margin: 0 0 8px; }
  .dash { border: 0; border-top: 1.5px dashed #111; margin: 8px 0; }
  .meta div { display: flex; gap: 10px; margin: 2px 0; }
  .meta b { width: 70px; font-weight: 600; }
  .meta .green { color: #15803d; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10.5px; }
  th, td { border: 1px solid #111; padding: 4px 3px; text-align: center; vertical-align: middle; }
  th { font-size: 9.5px; letter-spacing: 0.3px; }
  td.item { text-align: center; font-weight: 600; }
  td.unit { font-weight: 700; font-size: 9px; }
  td.qty small { font-size: 8px; font-weight: 600; }
  td.tot { font-weight: 700; }
  .total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; font-weight: 700; }
  .total .amt { color: #1d4ed8; font-size: 13px; }
  .barcode { text-align: center; margin-top: 14px; }
  .barcode img { height: 44px; }
  .thanks { text-align: center; margin-top: 8px; font-size: 10px; color: #374151; }
  .policy { text-align: center; margin-top: 5px; font-size: 7px; color: #6b7280; font-style: italic; font-weight: 400; }
  .credit { text-align: center; margin: 12px 0 2px; font-size: 6.5px; color: #b4b9c2; line-height: 1.5; font-weight: 400; font-style: normal; }
</style></head>
<body><div class="receipt">
  <h1>${esc(KF.getShopName().toUpperCase())}</h1>
  <p class="sub">Official Sales Receipt</p>
  <hr class="dash" />
  <div class="meta">
    <div><b>Order ID:</b><span class="green">${esc(sale.orderNo)}</span></div>
    <div><b>Date:</b><span>${esc(KF.formatDateTime(sale.time))}</span></div>
    <div><b>Served By:</b><span>${esc(sale.cashier)}</span></div>
    ${sale.customer ? `<div><b>Customer:</b><span>${esc(sale.customer)}</span></div>` : ''}
    <div><b>Payment:</b><span>${esc(sale.payment || 'Cash')}</span></div>
  </div>
  <table>
    <thead><tr><th>ITEM</th><th>UNIT</th><th>QTY</th><th>TOTAL</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <hr class="dash" />
  <div class="total"><span>TOTAL PAID:</span><span class="amt">${amt(sale.total)}</span></div>
  <div class="barcode"><img src="${barcodeDataUrl(sale.orderNo)}" alt="${esc(sale.orderNo)}" /></div>
  <p class="thanks">Thank you for your purchase!</p>
  <p class="policy">Items purchased cannot be returned.</p>
  <p class="credit">software built by KB.TECH Studio<br />0531806381</p>
</div></body></html>`;
  }

  // Prints through a hidden iframe so no pop-up blocker gets in the way.
  function printReceipt(sale) {
    const old = document.getElementById('receiptFrame');
    if (old) old.remove();
    const frame = document.createElement('iframe');
    frame.id = 'receiptFrame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(receiptHtml(sale));
    doc.close();
    const go = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* ignore */ }
    };
    if (doc.readyState === 'complete') setTimeout(go, 150);
    else frame.onload = () => setTimeout(go, 150);
  }

  window.KFReceipt = { receiptHtml, printReceipt, barcodeDataUrl };
})();
