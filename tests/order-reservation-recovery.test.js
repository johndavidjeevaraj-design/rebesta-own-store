import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-reservation-recovery-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;

const { recoverOrderReservationJournal, getOrder } = await import('../src/lib/store.js');
after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const order = {
  id: 'RB-RESERVATION-RECOVERY',
  status: 'PENDING_PAYMENT',
  paymentMethod: 'online',
  paymentStatus: 'PENDING',
  placedAt: new Date().toISOString(),
  items: [{ handle: 'tomato', title: 'Tomato', qty: 2 }, { handle: 'tomato', title: 'Tomato', qty: 1 }],
  totalInr: 120,
  history: []
};
function writeBase(stock, operationIds = []) {
  fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify([
    { handle: 'tomato', title: 'Tomato', stock, priceInr: 40, inventoryOperationIds: operationIds }
  ], null, 2));
  fs.writeFileSync(path.join(dataDir, 'orders.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'order-reservation-journal.json'), JSON.stringify({ version: 1, order }));
}
function stock() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf8'))[0].stock;
}

test('recovery applies an order reservation when a crash occurred before inventory commit', () => {
  writeBase(10);
  assert.deepEqual(recoverOrderReservationJournal(), { recovered: true, orderId: order.id });
  assert.equal(stock(), 7);
  assert.equal(getOrder(order.id).id, order.id);
  assert.equal(fs.existsSync(path.join(dataDir, 'order-reservation-journal.json')), false);
});

test('recovery does not deduct stock twice when a crash occurred after inventory commit', () => {
  writeBase(7, [`order:${order.id}:initial-reservation`]);
  assert.deepEqual(recoverOrderReservationJournal(), { recovered: true, orderId: order.id });
  assert.equal(stock(), 7);
  assert.equal(getOrder(order.id).id, order.id);
});

test('recovery is idempotent after journal removal', () => {
  writeBase(10);
  recoverOrderReservationJournal();
  assert.deepEqual(recoverOrderReservationJournal(), { recovered: false });
  assert.equal(stock(), 7);
});
