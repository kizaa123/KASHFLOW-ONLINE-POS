/* Paystack public settings (safe to put on the website).
   Secret key stays in Netlify: Site settings → Environment variables → PAYSTACK_SECRET_KEY
   Amount must match PAYSTACK_AMOUNT_GHS in Netlify. */
window.KF_PAYSTACK = {
  publicKey: 'pk_test_317c5d8236bd02243b29d4efcf92bf1c0776e34c',
  amountGhs: 2700,
  currency: 'GHS',
  label: 'KASHFLOW Online licence',
};
