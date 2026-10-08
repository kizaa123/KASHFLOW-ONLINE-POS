/* Confirms a Paystack payment with the secret key, then the shop can be unlocked.
   Netlify env: PAYSTACK_SECRET_KEY  and  PAYSTACK_AMOUNT_GHS (same number as js/paystack-config.js) */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, message: 'POST only.' }) };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  const expectedGhs = Number(process.env.PAYSTACK_AMOUNT_GHS || 0);
  if (!secret.startsWith('sk_')) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, message: 'Paystack secret is not set on Netlify.' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const reference = String(body.reference || '').trim();
  if (!reference) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'Missing payment reference.' }) };
  }

  try {
    const res = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
      headers: { Authorization: 'Bearer ' + secret },
    });
    const json = await res.json();
    const data = json && json.data;
    if (!json.status || !data || data.status !== 'success') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'Payment was not successful.' }) };
    }
    const paid = Number(data.amount) || 0;
    const want = Math.round(expectedGhs * 100);
    if (want > 0 && paid < want) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'Paid amount does not match the licence price.' }) };
    }
    if (String(data.currency || '').toUpperCase() !== 'GHS') {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, message: 'Unexpected currency.' }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        reference: data.reference,
        amount: paid / 100,
      }),
    };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, message: 'Could not verify payment.' }) };
  }
};
