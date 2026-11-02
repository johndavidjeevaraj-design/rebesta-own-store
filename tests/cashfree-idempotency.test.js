import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-cashfree-idempotency-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.APP_URL = 'https://example.test';
fs.writeFileSync(path.join(dataDir, 'cashfree-config.json'), JSON.stringify({
  mode: 'test', appId: 'test-app-id', secretKey: 'test-secret'
}));

const { createCashfreePayment } = await import('../src/lib/cashfree.js');
const originalFetch = globalThis.fetch;
const requests = [];

before(() => {
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
    if (requests.length === 1) throw Object.assign(new Error('simulated socket timeout'), { code: 'ETIMEDOUT' });
    return new Response(JSON.stringify({
      order_id: requests[0].body.order_id,
      cf_order_id: 'cf-test-123',
      payment_session_id: 'session-test-123'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Cashfree does not retry a definitive 4xx rejection', async () => {
  requests.length = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ message: 'Invalid request' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  };
  await assert.rejects(
    createCashfreePayment({
      id: 'RB-20261102-REJECT1',
      totalInr: 50,
      customer: { name: 'Test Customer', phone: '9876543210' }
    }),
    error => error.status === 400
  );
  assert.equal(requests.length, 1);
});

test('Cashfree create-order retry reuses one stable idempotency key and identical merchant payload', async () => {
  requests.length = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
    if (requests.length === 1) throw Object.assign(new Error('simulated socket timeout'), { code: 'ETIMEDOUT' });
    return new Response(JSON.stringify({
      order_id: requests[0].body.order_id,
      cf_order_id: 'cf-test-123',
      payment_session_id: 'session-test-123'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const order = {
    id: 'RB-20261102-ABC123',
    totalInr: 155.5,
    customer: { name: 'Test Customer', phone: '9876543210', email: 'test@example.test' }
  };
  const payment = await createCashfreePayment(order);

  assert.equal(payment.sessionId, 'session-test-123');
  assert.equal(requests.length, 2);
  assert.match(requests[0].headers['x-idempotency-key'], /^[a-f0-9]{64}$/);
  assert.equal(requests[1].headers['x-idempotency-key'], requests[0].headers['x-idempotency-key']);
  assert.deepEqual(requests[1].body, requests[0].body);
  assert.equal(requests[0].body.order_id, order.id);
  assert.equal(requests[0].body.order_amount, order.totalInr);
  assert.equal(requests[0].body.order_currency, 'INR');
});

test('Cashfree order expiry remains stable when the same Rebesta order is retried later', async () => {
  requests.length = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ headers: options.headers, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      order_id: requests[0].body.order_id,
      cf_order_id: 'cf-stable-expiry',
      payment_session_id: 'session-stable-expiry'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const order = {
    id: 'RB-STABLE-EXPIRY',
    placedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    totalInr: 75,
    customer: { name: 'Test Customer', phone: '9876543210' }
  };
  await createCashfreePayment(order);
  await createCashfreePayment(order);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.order_expiry_time, requests[1].body.order_expiry_time);
  assert.equal(requests[0].headers['x-idempotency-key'], requests[1].headers['x-idempotency-key']);
});
