import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYU_KEY = 'testmerchant';
process.env.PAYU_SALT = 'testsalt';
process.env.APP_URL = 'https://rebestafresh.in';

const { createPayuPayment, validatePayuResponse, payuInternals } = await import('../src/lib/payu.js');

const order = {
  id: 'RB-20260922-ABC123',
  totalInr: 155,
  customer: { name: 'Test Customer', phone: '9876543210' },
  paymentMethod: 'online'
};

test('PayU hosted request contains hash but never exposes the salt', () => {
  const payment = createPayuPayment(order);
  assert.equal(payment.action, 'https://secure.payu.in/_payment');
  assert.equal(payment.fields.amount, '155.00');
  assert.equal(payment.fields.udf1, order.id);
  assert.ok(/^[a-f0-9]{128}$/.test(payment.fields.hash));
  assert.equal('salt' in payment.fields, false);
});

test('PayU reverse-hash validation rejects tampering and accepts a valid response', () => {
  const payment = createPayuPayment(order);
  const response = {
    ...payment.fields,
    status: 'success',
    mihpayid: '123456789',
    mode: 'UPI',
    hash: null
  };
  const reverse = [
    'testsalt',
    response.status,
    '', '', '', '', '',
    response.udf5,
    response.udf4,
    response.udf3,
    response.udf2,
    response.udf1,
    response.email,
    response.firstname,
    response.productinfo,
    response.amount,
    response.txnid,
    response.key
  ].join('|');
  response.hash = payuInternals.sha512(reverse);
  assert.deepEqual(validatePayuResponse(response, order), { valid: true, success: true });

  const tampered = { ...response, amount: '1.00', hash: payuInternals.sha512(reverse) };
  assert.equal(validatePayuResponse(tampered, order).valid, false);
});
