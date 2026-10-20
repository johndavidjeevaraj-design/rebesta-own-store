import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-order-gate-'));
const adminKey = 'order-gate-test-admin-key';
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.ADMIN_KEY = adminKey;

const { createStoreApp } = await import('../src/app.js');
const { saveOrders, readOrders, claimOrderConfirmationNotice, markPayuPayment } = await import('../src/lib/store.js');
const { buildMorningDigest } = await import('../src/lib/digest.js');
const server = createStoreApp().listen(0, '127.0.0.1');
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function fixtureOrders() {
  const placedAt = new Date().toISOString();
  const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const yesterdayAt = new Date(`${todayIst}T12:00:00+05:30`);
  yesterdayAt.setUTCDate(yesterdayAt.getUTCDate() - 1);
  const base = {
    placedAt,
    deliveryDate: { iso: todayIst },
    totalInr: 100,
    customer: { name: 'Test Customer', phone: '9876543210' },
    items: [],
    history: []
  };
  return [
    { ...base, id: 'COD-RECEIVED', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'PAY_ON_DELIVERY' },
    { ...base, id: 'ONLINE-PENDING', status: 'PENDING_PAYMENT', paymentMethod: 'online', paymentStatus: 'PENDING' },
    { ...base, placedAt: yesterdayAt.toISOString(), id: 'ONLINE-FAILED', status: 'PAYMENT_FAILED', paymentMethod: 'online', paymentStatus: 'FAILED' },
    { ...base, id: 'ONLINE-PAID', status: 'PLACED', paymentMethod: 'online', paymentStatus: 'PAID_ONLINE' },
    { ...base, id: 'ONLINE-REFUNDED', status: 'CANCELLED', paymentMethod: 'online', paymentStatus: 'REFUNDED' }
  ];
}

async function adminRequest(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'x-admin-key': adminKey, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}

test('COD is received at submission; online attempts stay pending until verified, without fake status overrides', async () => {
  saveOrders(fixtureOrders());

  const received = await adminRequest('/api/admin/orders');
  assert.equal(received.status, 200);
  assert.deepEqual(new Set(received.body.orders.map(order => order.id)), new Set(['COD-RECEIVED', 'ONLINE-PAID', 'ONLINE-REFUNDED']));

  const pending = await adminRequest('/api/admin/orders?view=pending');
  assert.equal(pending.status, 200);
  assert.deepEqual(new Set(pending.body.orders.map(order => order.id)), new Set(['ONLINE-PENDING', 'ONLINE-FAILED']));

  const dashboard = await adminRequest('/api/admin/dashboard');
  assert.equal(dashboard.body.metrics.ordersToday, 2);
  assert.equal(dashboard.body.metrics.activeOrders, 2);
  assert.equal(dashboard.body.metrics.revenueTodayInr, 200);

  const digest = buildMorningDigest(new Date());
  assert.equal(digest.stats.ordersYesterday, 0, 'failed online attempts do not inflate the morning digest');
  assert.equal(digest.stats.revenueYesterday, 0);
  assert.equal(digest.stats.todayOrders, 2, 'only received orders enter the delivery plan');

  const promoteUnpaid = await adminRequest('/api/admin/orders/ONLINE-PENDING/status', {
    method: 'PATCH', body: { status: 'PLACED' }
  });
  assert.equal(promoteUnpaid.status, 409);
  const fakePaid = await adminRequest('/api/admin/orders/ONLINE-PENDING/payment', {
    method: 'PATCH', body: { paymentStatus: 'PAID_ONLINE' }
  });
  assert.equal(fakePaid.status, 409);

  assert.equal(claimOrderConfirmationNotice('ONLINE-PENDING'), null);
  assert.equal(claimOrderConfirmationNotice('ONLINE-FAILED'), null);
  assert.equal(claimOrderConfirmationNotice('COD-RECEIVED')?.id, 'COD-RECEIVED');
  assert.equal(claimOrderConfirmationNotice('COD-RECEIVED'), null, 'COD confirmation is one-time');
  assert.equal(claimOrderConfirmationNotice('ONLINE-PAID')?.id, 'ONLINE-PAID');
  assert.equal(claimOrderConfirmationNotice('ONLINE-PAID'), null, 'online confirmation is one-time');

  // Only a successful gateway verification changes the pending attempt into a received order.
  markPayuPayment('ONLINE-PENDING', {
    success: true,
    reference: 'verified-test-payment',
    mode: 'test',
    raw: { verified: true },
    provider: 'cashfree'
  });
  const updated = readOrders().find(order => order.id === 'ONLINE-PENDING');
  assert.equal(updated.status, 'PLACED');
  assert.equal(updated.paymentStatus, 'PAID_ONLINE');
  assert.equal(claimOrderConfirmationNotice('ONLINE-PENDING')?.id, 'ONLINE-PENDING');

  const receivedAfterVerification = await adminRequest('/api/admin/orders');
  assert.ok(receivedAfterVerification.body.orders.some(order => order.id === 'ONLINE-PENDING'));
  const pendingAfterVerification = await adminRequest('/api/admin/orders?view=pending');
  assert.ok(!pendingAfterVerification.body.orders.some(order => order.id === 'ONLINE-PENDING'));
});
