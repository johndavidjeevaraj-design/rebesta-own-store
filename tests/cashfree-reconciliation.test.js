import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-cashfree-reconcile-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.APP_URL = 'https://example.test';
fs.writeFileSync(path.join(dataDir, 'cashfree-config.json'), JSON.stringify({
  mode: 'test', appId: 'sandbox-app', secretKey: 'sandbox-secret'
}));

const { reconcileCashfreePayments } = await import('../src/lib/cashfree-reconciliation.js');
const { getOrder } = await import('../src/lib/store.js');
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function fixture(id) {
  const order = {
    id,
    status: 'PENDING_PAYMENT',
    paymentMethod: 'online',
    paymentStatus: 'PENDING',
    placedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    totalInr: 120,
    customer: { name: 'Test Customer', phone: '9876543210' },
    items: [{ handle: 'tomato', title: 'Tomato', qty: 3 }],
    history: []
  };
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify([order], null, 2));
  fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify([{
    handle: 'tomato',
    title: 'Tomato',
    stock: 7,
    priceInr: 40,
    inventoryOperationIds: [`order:${id}:initial-reservation`]
  }], null, 2));
  return order;
}
function stock() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf8'))[0].stock;
}
function providerOrder(order, status) {
  return { order_id: order.id, order_amount: 120, order_currency: 'INR', order_status: status, cf_order_id: 'cf-order' };
}
function paidPayment(order) {
  return {
    order_id: order.id,
    cf_payment_id: 'cf-payment-123',
    payment_status: 'SUCCESS',
    payment_amount: 120,
    payment_currency: 'INR'
  };
}
function mockProvider(orderResponse, payments = []) {
  globalThis.fetch = async url => {
    if (String(url).endsWith('/payments')) {
      return new Response(JSON.stringify(payments), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (orderResponse instanceof Response) return orderResponse;
    return new Response(JSON.stringify(orderResponse), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('reconciliation confirms a delayed payment only after matching Get Order and Get Payments responses', async () => {
  const order = fixture('RB-RECONCILE-PAID');
  mockProvider(providerOrder(order, 'PAID'), [paidPayment(order)]);
  const result = await reconcileCashfreePayments();
  assert.equal(result.checked, 1);
  assert.equal(getOrder(order.id).paymentStatus, 'PAID_ONLINE');
  assert.equal(getOrder(order.id).paymentReference, 'cf-payment-123');
  assert.equal(getOrder(order.id).status, 'PLACED');
  assert.equal(stock(), 7, 'a successful payment keeps the reservation deducted');
});

test('reconciliation catches a late successful payment after a customer cancellation', async () => {
  const order = fixture('RB-RECONCILE-LATE-PAID');
  order.status = 'CANCELLED';
  order.paymentStatus = 'CANCELLED_NO_CHARGE';
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify([order], null, 2));
  fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify([{
    handle: 'tomato',
    title: 'Tomato',
    stock: 10,
    priceInr: 40,
    inventoryOperationIds: [
      `order:${order.id}:initial-reservation`,
      `order:${order.id}:status:0:release`
    ]
  }], null, 2));

  mockProvider(providerOrder(order, 'TERMINATED'), [paidPayment(order)]);
  const result = await reconcileCashfreePayments();
  assert.equal(result.checked, 1);
  assert.equal(getOrder(order.id).paymentStatus, 'PAID_ONLINE');
  assert.equal(getOrder(order.id).status, 'PAID_NEEDS_REVIEW');
  assert.equal(stock(), 10, 'a late payment does not silently re-reserve cancelled stock');
});

test('cancelled-order reconciliation records a check and avoids hammering Cashfree', async () => {
  const order = fixture('RB-RECONCILE-CANCELLED-NO-LATE-PAY');
  order.status = 'CANCELLED';
  order.paymentStatus = 'CANCELLED_NO_CHARGE';
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify([order], null, 2));
  fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify([{
    handle: 'tomato', title: 'Tomato', stock: 10, priceInr: 40,
    inventoryOperationIds: [`order:${order.id}:initial-reservation`]
  }], null, 2));
  mockProvider(providerOrder(order, 'TERMINATED'), []);
  assert.equal((await reconcileCashfreePayments()).checked, 1);
  assert.ok(getOrder(order.id).cashfreeLastCheckedAt);
  assert.equal((await reconcileCashfreePayments()).checked, 0);
});

test('reconciliation releases reserved stock when Cashfree confirms the order expired', async () => {
  const order = fixture('RB-RECONCILE-EXPIRED');
  mockProvider(providerOrder(order, 'EXPIRED'));
  const result = await reconcileCashfreePayments();
  assert.equal(result.checked, 1);
  assert.equal(getOrder(order.id).paymentStatus, 'FAILED');
  assert.equal(getOrder(order.id).status, 'PAYMENT_FAILED');
  assert.equal(stock(), 10);
});

test('reconciliation releases stock after a delayed termination request is confirmed', async () => {
  const order = fixture('RB-RECONCILE-TERMINATED');
  mockProvider(providerOrder(order, 'TERMINATED'));
  const result = await reconcileCashfreePayments();
  assert.equal(result.checked, 1);
  assert.equal(getOrder(order.id).paymentStatus, 'CANCELLED_NO_CHARGE');
  assert.equal(getOrder(order.id).status, 'CANCELLED');
  assert.equal(stock(), 10);
});

test('reconciliation releases stock after a provider 404 only beyond the propagation grace period', async () => {
  const order = fixture('RB-RECONCILE-NOTFOUND');
  mockProvider(new Response(JSON.stringify({ message: 'order not found' }), {
    status: 404, headers: { 'content-type': 'application/json' }
  }));
  const result = await reconcileCashfreePayments();
  assert.equal(result.checked, 1);
  assert.equal(getOrder(order.id).paymentStatus, 'FAILED');
  assert.equal(stock(), 10);
});

test('reconciliation leaves stock reserved on ambiguous provider server errors', async () => {
  const order = fixture('RB-RECONCILE-AMBIGUOUS');
  mockProvider(new Response(JSON.stringify({ message: 'temporary outage' }), {
    status: 503, headers: { 'content-type': 'application/json' }
  }));
  const result = await reconcileCashfreePayments();
  assert.equal(result.checked, 1);
  assert.equal(getOrder(order.id).paymentStatus, 'PENDING');
  assert.equal(stock(), 7);
});
