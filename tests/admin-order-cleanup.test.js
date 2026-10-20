import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-order-cleanup-'));
const adminKey = 'cleanup-test-admin-key';
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.ADMIN_KEY = adminKey;

const { createStoreApp } = await import('../src/app.js');
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

const originalOrders = () => [
  { id: 'original-naveen', customer: { name: '  NAVEEN   VISHOR ' }, status: 'PLACED', placedAt: '2026-10-18T08:00:00.000Z' },
  { id: 'original-chithra', customer: { name: 'Chithra' }, status: 'DELIVERED', placedAt: '2026-10-18T08:30:00.000Z' },
  { id: 'original-hasini', customer: { name: 'HASINI' }, status: 'PLACED', placedAt: '2026-10-18T09:00:00.000Z' },
  { id: 'fake-1', customer: { name: 'Test Customer' }, status: 'PLACED', placedAt: '2026-10-19T08:00:00.000Z' },
  { id: 'fake-2', customer: { name: '' }, status: 'PAYMENT_FAILED', placedAt: '2026-10-19T08:30:00.000Z' }
];

function saveFixture(orders) {
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(orders, null, 2));
}

async function requestCleanup(pathname, { key = adminKey, body = {} } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-admin-key'] = key;
  const response = await fetch(`${baseUrl}/api/admin/orders/cleanup/${pathname}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test('fake-order cleanup previews exact originals, blocks unsafe/stale cases, and backs up before deletion', async () => {
  saveFixture(originalOrders());

  const unauthorized = await requestCleanup('preview', { key: '' });
  assert.equal(unauthorized.status, 401);

  const preview = await requestCleanup('preview');
  assert.equal(preview.status, 200);
  assert.equal(preview.body.totalCount, 5);
  assert.equal(preview.body.keepCount, 3);
  assert.equal(preview.body.removeCount, 2);
  assert.equal(preview.body.canDelete, true);
  assert.deepEqual(preview.body.preservedByName.map(entry => entry.name), ['Naveen Vishor N', 'Chithra', 'Hasini']);
  assert.deepEqual(preview.body.preservedByName.map(entry => entry.count), [1, 1, 1]);
  assert.deepEqual(preview.body.kept.map(order => order.id), ['original-naveen', 'original-chithra', 'original-hasini']);
  assert.deepEqual(preview.body.removed.map(order => order.id), ['fake-1', 'fake-2']);

  // Any order change after preview invalidates the signed confirmation token.
  const changed = [...originalOrders(), { id: 'late-order', customer: { name: 'Another fake' }, status: 'PLACED' }];
  saveFixture(changed);
  const staleCommit = await requestCleanup('commit', { body: { previewToken: preview.body.previewToken } });
  assert.equal(staleCommit.status, 409);
  assert.match(staleCommit.body.error, /changed since the preview/i);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')).length, 6);
  assert.equal(fs.existsSync(path.join(dataDir, 'backups')), false);

  // Missing or duplicate originals cannot be deleted, even with otherwise valid fake records.
  saveFixture([
    { id: 'naveen-1', customer: { name: 'Naveen Vishor' } },
    { id: 'naveen-2', customer: { name: 'Naveen Vishor' } },
    { id: 'chithra', customer: { name: 'Chithra' } },
    { id: 'fake', customer: { name: 'Fake Person' } }
  ]);
  const unsafePreview = await requestCleanup('preview');
  assert.equal(unsafePreview.body.canDelete, false);
  assert.equal(unsafePreview.body.previewToken, undefined);
  assert.match(unsafePreview.body.issues.join(' '), /Naveen Vishor N: expected exactly one/i);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')).length, 4);

  // Fresh valid preview => backup first, then exactly the three named originals remain.
  saveFixture(originalOrders());
  const finalPreview = await requestCleanup('preview');
  const completed = await requestCleanup('commit', { body: { previewToken: finalPreview.body.previewToken } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.keptCount, 3);
  assert.equal(completed.body.removedCount, 2);
  const remaining = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'));
  assert.deepEqual(remaining.map(order => order.id), ['original-naveen', 'original-chithra', 'original-hasini']);
  const backupPath = path.join(dataDir, 'backups', completed.body.backupName);
  assert.equal(fs.existsSync(backupPath), true);
  assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(backupPath, 'utf8')).length, 5);

  const reusedToken = await requestCleanup('commit', { body: { previewToken: finalPreview.body.previewToken } });
  assert.equal(reusedToken.status, 409);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')).length, 3);
});

test('Naveen Vishor N and Naveen Vishor are aliases for one keeper; both orders block deletion', async () => {
  const withMiddleInitial = originalOrders();
  withMiddleInitial[0].customer.name = 'Naveen Vishor N';
  saveFixture(withMiddleInitial);

  const preview = await requestCleanup('preview');
  assert.equal(preview.body.canDelete, true);
  assert.deepEqual(preview.body.preservedByName.map(entry => entry.name), ['Naveen Vishor N', 'Chithra', 'Hasini']);
  assert.deepEqual(preview.body.preservedByName.map(entry => entry.count), [1, 1, 1]);
  assert.deepEqual(preview.body.kept.map(order => order.id), ['original-naveen', 'original-chithra', 'original-hasini']);

  saveFixture([
    ...withMiddleInitial,
    { id: 'duplicate-naveen-alias', customer: { name: 'Naveen Vishor' }, status: 'PLACED' }
  ]);
  const duplicatePreview = await requestCleanup('preview');
  assert.equal(duplicatePreview.body.canDelete, false);
  assert.equal(duplicatePreview.body.previewToken, undefined);
  assert.match(duplicatePreview.body.issues.join(' '), /Naveen Vishor N: expected exactly one/i);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8')).length, 6);
});
