import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-inventory-idempotency-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;

const { adjustOrderInventory, updateOrderStatus, markPayuPayment, getOrder, claimOrderConfirmationNotice, recordCashfreeWebhookEvent, hasCashfreeWebhookEvent } = await import('../src/lib/store.js');

after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function writeFixture(order, stock = 10) {
  fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify([
    { handle: 'tomato', title: 'Tomato', stock, priceInr: 40 }
  ], null, 2));
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify([order], null, 2));
}
function stock() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf8'))[0].stock;
}
function pendingOrder(overrides = {}) {
  return {
    id: 'RB-TEST-INVENTORY',
    status: 'PENDING_PAYMENT',
    paymentMethod: 'online',
    paymentStatus: 'PENDING',
    items: [{ handle: 'tomato', qty: 2 }, { handle: 'tomato', qty: 1 }],
    history: [],
    ...overrides
  };
}

test('order cancellation inventory release is idempotent across a retry after the product snapshot is saved', () => {
  const order = pendingOrder();
  writeFixture(order);

  assert.throws(
    () => updateOrderStatus(order.id, 'CANCELLED', 'customer cancelled'),
    error => error.status === 409
  );
  assert.equal(stock(), 10, 'stock remains reserved until Cashfree termination is confirmed');

  const cancelled = updateOrderStatus(order.id, 'CANCELLED', 'Cashfree order terminated; test compensation');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(stock(), 13, 'duplicate product lines are aggregated and stock is restored once');

  // Simulate retry after products.json committed but before orders.json did.
  adjustOrderInventory(order, 1, `order:${order.id}:status:0:release`);
  assert.equal(stock(), 13, 'the durable per-product operation marker prevents a second release');
});

test('definitive Cashfree create-order rejection compensates the reserved inventory exactly once', () => {
  const order = pendingOrder();
  writeFixture(order, 7); // three units are already reserved
  const cancelled = updateOrderStatus(
    order.id,
    'CANCELLED',
    'Cashfree rejected payment-order creation; inventory reservation released'
  );
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.paymentStatus, 'CANCELLED_NO_CHARGE');
  assert.equal(stock(), 10);
  updateOrderStatus(
    order.id,
    'CANCELLED',
    'Cashfree rejected payment-order creation; retry compensation'
  );
  assert.equal(stock(), 10);
});

test('verified payment failure stock release is idempotent across retry', () => {
  const order = pendingOrder();
  writeFixture(order);

  const failed = markPayuPayment(order.id, {
    success: false, reference: '', mode: '', provider: 'cashfree'
  });
  assert.equal(failed.status, 'PAYMENT_FAILED');
  assert.equal(stock(), 13);

  // Simulate the same failure handler running again after product save.
  adjustOrderInventory(order, 1, `order:${order.id}:payment-failure`);
  assert.equal(stock(), 13);
  assert.equal(getOrder(order.id).status, 'PAYMENT_FAILED');
});

test('inventory reservation reactivation uses a distinct idempotency key', () => {
  const order = pendingOrder({
    status: 'CANCELLED',
    paymentMethod: 'cod',
    paymentStatus: 'CANCELLED_NO_CHARGE',
    history: [{ status: 'CANCELLED', at: new Date().toISOString(), note: 'test' }]
  });
  writeFixture(order, 13);

  const reactivated = updateOrderStatus(order.id, 'PLACED', 'test reactivation');
  assert.equal(reactivated.status, 'PLACED');
  assert.equal(stock(), 10);

  adjustOrderInventory(order, -1, `order:${order.id}:status:1:reserve`);
  assert.equal(stock(), 10, 'retry does not deduct the same reservation twice');
});

test('Cashfree webhook payment IDs are persisted and deduplicated', () => {
  const order = pendingOrder();
  writeFixture(order);
  assert.equal(hasCashfreeWebhookEvent(order.id, 'cf-payment-123'), false);
  assert.equal(recordCashfreeWebhookEvent(order.id, 'cf-payment-123'), true);
  assert.equal(hasCashfreeWebhookEvent(order.id, 'cf-payment-123'), true);
  assert.equal(recordCashfreeWebhookEvent(order.id, 'cf-payment-123'), false);
});

test('late payment after a cancelled order is flagged for review, not a normal confirmation', () => {
  const order = pendingOrder({
    status: 'CANCELLED',
    paymentStatus: 'CANCELLED_NO_CHARGE',
    history: [{ status: 'CANCELLED', at: new Date().toISOString(), note: 'Cashfree order terminated' }]
  });
  writeFixture(order);
  const paid = markPayuPayment(order.id, {
    success: true, reference: 'cf-payment-late', mode: 'cashfree', provider: 'cashfree'
  });
  assert.equal(paid.status, 'PAID_NEEDS_REVIEW');
  assert.equal(paid.paymentStatus, 'PAID_ONLINE');
  assert.equal(claimOrderConfirmationNotice(order.id), null);
});
