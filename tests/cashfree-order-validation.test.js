import test from 'node:test';
import assert from 'node:assert/strict';

const { validateCashfreeOrder, validateCashfreePayment, verifyCashfreeWebhookSignature } = await import('../src/lib/cashfree.js');
import crypto from 'node:crypto';

const order = { id: 'RB-20261102-ABC123', totalInr: 155.5 };
const paid = { order_id: order.id, order_amount: 155.5, order_currency: 'INR', order_status: 'PAID', cf_order_id: 'cf-123' };

test('Cashfree paid order must match merchant order ID, exact amount, and INR currency', () => {
  assert.deepEqual(validateCashfreeOrder(order, paid), { valid: true });
  assert.equal(validateCashfreeOrder(order, { ...paid, order_id: 'OTHER' }).reason, 'order_id_mismatch');
  assert.equal(validateCashfreeOrder(order, { ...paid, order_amount: 155 }).reason, 'amount_mismatch');
  assert.equal(validateCashfreeOrder(order, { ...paid, order_currency: 'USD' }).reason, 'currency_mismatch');
  assert.equal(validateCashfreeOrder(order, { ...paid, order_status: 'ACTIVE' }).reason, 'not_paid');
  assert.equal(validateCashfreeOrder(order, null).reason, 'missing_order');
});

test('Cashfree amount comparison tolerates numeric and decimal-string representations only at paise precision', () => {
  assert.equal(validateCashfreeOrder(order, { ...paid, order_amount: '155.50' }).valid, true);
  assert.equal(validateCashfreeOrder(order, { ...paid, order_amount: '155.51' }).reason, 'amount_mismatch');
});

test('Cashfree payment confirmation requires matching order, successful payment ID, amount and INR currency', () => {
  const payment = {
    order_id: order.id,
    cf_payment_id: 'payment-123',
    payment_status: 'SUCCESS',
    payment_amount: 155.5,
    payment_currency: 'INR'
  };
  assert.deepEqual(validateCashfreePayment(order, payment), { valid: true, paymentId: 'payment-123' });
  assert.equal(validateCashfreePayment(order, { ...payment, order_id: 'OTHER' }).reason, 'order_id_mismatch');
  assert.equal(validateCashfreePayment(order, { ...payment, cf_payment_id: '' }).reason, 'missing_payment_id');
  assert.equal(validateCashfreePayment(order, { ...payment, payment_status: 'PENDING' }).reason, 'payment_not_success');
  assert.equal(validateCashfreePayment(order, { ...payment, payment_amount: 155 }).reason, 'payment_amount_mismatch');
  assert.equal(validateCashfreePayment(order, { ...payment, payment_currency: 'USD' }).reason, 'payment_currency_mismatch');
});

test('Cashfree webhook signature is checked against timestamp plus exact raw body', () => {
  const secret = 'cashfree-test-secret';
  const timestamp = '1730000000000';
  const rawBody = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { payment: { cf_payment_id: 'payment-123' } } });
  const signature = crypto.createHmac('sha256', secret).update(timestamp + rawBody, 'utf8').digest('base64');
  assert.equal(verifyCashfreeWebhookSignature(signature, timestamp, rawBody, secret), true);
  assert.equal(verifyCashfreeWebhookSignature(signature, timestamp, rawBody + ' ', secret), false);
  assert.equal(verifyCashfreeWebhookSignature(signature, timestamp, rawBody, 'wrong-secret'), false);
  assert.equal(verifyCashfreeWebhookSignature('', timestamp, rawBody, secret), false);
});
