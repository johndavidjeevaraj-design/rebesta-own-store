import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-marketing-'));
const adminKey = 'marketing-test-admin-key';
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.ADMIN_KEY = adminKey;

const { createStoreApp } = await import('../src/app.js');
const { saveOrders, saveSettings, loadSettings } = await import('../src/lib/store.js');
const {
  getMarketingContact,
  getMarketingProviderStatus,
  isMarketingOptedIn,
  runDailyMarketingSweep,
  subscribeFromConfirmedOrder,
  subscribeMarketingContact,
  unsubscribeMarketingToken,
  createMarketingUnsubscribeToken
} = await import('../src/lib/marketing.js');
const { saveMarketingWhatsAppConfig, sendMarketingWhatsAppTemplate } = await import('../src/sms.js');
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

async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

function admin(pathname, options = {}) {
  return request(pathname, { ...options, headers: { 'x-admin-key': adminKey, ...(options.headers || {}) } });
}

function seedOrders() {
  saveOrders([
    { id: 'COD-DELIVERED', status: 'DELIVERED', paymentMethod: 'cod', paymentStatus: 'PAID_CASH_ON_DELIVERY', customer: { name: 'Test Customer', phone: '9876543210' }, items: [], history: [] },
    { id: 'COD-PLACED', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'PAY_ON_DELIVERY', customer: { name: 'Test Customer', phone: '9876543210' }, items: [], history: [] },
    { id: 'ONLINE-PENDING', status: 'PENDING_PAYMENT', paymentMethod: 'online', paymentStatus: 'PENDING', marketingWhatsAppOptIn: true, customer: { name: 'Test Customer', phone: '9876543210' }, items: [], history: [] },
    { id: 'ONLINE-PAID', status: 'PLACED', paymentMethod: 'online', paymentStatus: 'PAID_ONLINE', marketingWhatsAppOptIn: true, customer: { name: 'Test Customer', phone: '9123456789' }, items: [], history: [] }
  ]);
}

test('public settings expose only the Instagram link and opt-in availability; campaign stays off by default', async () => {
  const settings = await request('/api/settings');
  assert.equal(settings.status, 200);
  assert.equal(settings.body.marketing.instagramUrl, 'https://www.instagram.com/rebestafresh?xtok=MWNtb3N2ZjA3am42cA==');
  assert.equal(settings.body.marketing.whatsappOptInEnabled, true);

  const blocked = await request('/api/admin/marketing');
  assert.equal(blocked.status, 401);
  const view = await admin('/api/admin/marketing');
  assert.equal(view.status, 200);
  assert.equal(view.body.marketing.whatsapp.enabled, false);
  assert.equal(view.body.marketing.whatsapp.sendTimeIst, '');
  assert.equal(view.body.provider.configured, false);
  assert.equal(view.body.contacts.optedIn, 0);
});

test('delivered Track-page opt-in requires matching order/phone and explicit consent', async () => {
  seedOrders();
  const noConsent = await request('/api/marketing/opt-in', { method: 'POST', body: { orderId: 'COD-DELIVERED', phone: '9876543210' } });
  assert.equal(noConsent.status, 400);
  const mismatch = await request('/api/marketing/opt-in', { method: 'POST', body: { orderId: 'COD-DELIVERED', phone: '9876543211', consent: true } });
  assert.equal(mismatch.status, 403);
  const notDelivered = await request('/api/marketing/opt-in', { method: 'POST', body: { orderId: 'COD-PLACED', phone: '9876543210', consent: true } });
  assert.equal(notDelivered.status, 409);

  const joined = await request('/api/marketing/opt-in', { method: 'POST', body: { orderId: 'COD-DELIVERED', phone: '9876543210', consent: true } });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.subscribed, true);
  assert.equal(isMarketingOptedIn('9876543210'), true);
  const tracked = await request('/api/orders/COD-DELIVERED?phone=9876543210');
  assert.equal(tracked.body.order.marketingSubscribed, true);

  const optedOut = await request('/api/marketing/opt-out', { method: 'POST', body: { orderId: 'COD-DELIVERED', phone: '9876543210' } });
  assert.equal(optedOut.status, 200);
  assert.equal(isMarketingOptedIn('9876543210'), false);
});

test('checkout consent is subscribed only after COD placement or verified online payment', () => {
  assert.equal(subscribeFromConfirmedOrder({ id: 'COD-1', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'PAY_ON_DELIVERY', marketingWhatsAppOptIn: true, customer: { phone: '9876543210' } }), true);
  assert.equal(isMarketingOptedIn('9876543210'), true);
  assert.equal(subscribeFromConfirmedOrder({ id: 'ONLINE-1', status: 'PENDING_PAYMENT', paymentMethod: 'online', paymentStatus: 'PENDING', marketingWhatsAppOptIn: true, customer: { phone: '9876543211' } }), false);
  assert.equal(isMarketingOptedIn('9876543211'), false);
  assert.equal(subscribeFromConfirmedOrder({ id: 'ONLINE-2', status: 'PLACED', paymentMethod: 'online', paymentStatus: 'PAID_ONLINE', marketingWhatsAppOptIn: true, customer: { phone: '9123456789' } }), true);
  assert.equal(isMarketingOptedIn('9123456789'), true);
  assert.equal(subscribeFromConfirmedOrder({ id: 'ONLINE-3', status: 'PLACED', paymentMethod: 'online', paymentStatus: 'PAID_ONLINE', marketingWhatsAppOptIn: false, customer: { phone: '9876543212' } }), false);
  assert.equal(isMarketingOptedIn('9876543212'), false);
});

test('signed unsubscribe link opts out without exposing a phone number', async () => {
  subscribeMarketingContact('9876543210', { source: 'checkout', orderId: 'COD-2' });
  const contact = getMarketingContact('9876543210');
  const token = createMarketingUnsubscribeToken(contact.id);
  const page = await request(`/unsubscribe?token=${encodeURIComponent(token)}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /Confirm to stop/);
  assert.doesNotMatch(page.body, /9876543210/);

  const response = await fetch(`${baseUrl}/unsubscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token })
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /You’re unsubscribed/);
  assert.equal(isMarketingOptedIn('9876543210'), false);
  assert.equal(unsubscribeMarketingToken('forged.token').ok, false);
});

test('Admin validates Instagram URL, keeps daily sending paused, and never returns provider secrets', async () => {
  const invalidUrl = await admin('/api/admin/marketing', { method: 'PATCH', body: { instagramUrl: 'https://example.com/rebestafresh' } });
  assert.equal(invalidUrl.status, 400);
  const normalized = await admin('/api/admin/marketing', { method: 'PATCH', body: { instagramUrl: 'https://www.instagram.com/rebestafresh?xtok=MWNtb3N2ZjA3am42cA==', collectOptIns: true } });
  assert.equal(normalized.status, 200);
  assert.equal(normalized.body.marketing.instagramUrl, 'https://www.instagram.com/rebestafresh?xtok=MWNtb3N2ZjA3am42cA==');
  assert.equal(normalized.body.marketing.whatsapp.enabled, false);

  const missingProvider = await admin('/api/admin/marketing', { method: 'PATCH', body: { enabled: true, sendTimeIst: '09:00', messageTemplate: 'Daily note' } });
  assert.equal(missingProvider.status, 400);
  assert.match(missingProvider.body.error, /provider/);

  const configured = await admin('/api/admin/marketing/provider', {
    method: 'POST', body: { integratedNumber: '918123456789', templateName: 'daily_marketing', language: 'en', authKey: 'test-secret-key' }
  });
  assert.equal(configured.status, 200);
  assert.equal(configured.body.provider.configured, true);
  assert.equal(JSON.stringify(configured.body).includes('test-secret-key'), false);
  assert.equal(getMarketingProviderStatus().configured, true);
  assert.equal(loadSettings().marketing.whatsapp.enabled, false, 'provider changes never enable sending');
});

test('WhatsApp sender uses only the configured approved template and unsubscribe variable', async () => {
  saveMarketingWhatsAppConfig({ integratedNumber: '918123456789', templateName: 'daily_marketing', language: 'en', authKey: 'test-secret-key' });
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await sendMarketingWhatsAppTemplate('9876543210', 'Daily note', 'https://rebestafresh.in/unsubscribe?token=opaque');
    assert.deepEqual(result, { ok: true });
    assert.match(captured.url, /api\.msg91\.com/);
    assert.equal(captured.headers.authkey, 'test-secret-key');
    const template = captured.body.payload.template;
    assert.equal(template.name, 'daily_marketing');
    assert.equal(template.to_and_components[0].to[0], '919876543210');
    assert.equal(template.to_and_components[0].components.body_1.value, 'Daily note');
    assert.equal(template.to_and_components[0].components.body_2.value, 'https://rebestafresh.in/unsubscribe?token=opaque');
  } finally { globalThis.fetch = originalFetch; }
});

test('daily scheduler sends once per opted-in contact only after configured time and provider', async () => {
  fs.rmSync(path.join(dataDir, 'marketing-contacts.json'), { force: true });
  saveMarketingWhatsAppConfig({ integratedNumber: '918123456789', templateName: 'daily_marketing', language: 'en', authKey: 'test-secret-key' });
  saveSettings({
    marketing: {
      instagramUrl: 'https://www.instagram.com/rebestafresh/',
      whatsapp: { collectOptIns: true, enabled: true, sendTimeIst: '08:00', messageTemplate: 'Daily note for customers' }
    }
  });
  subscribeMarketingContact('9876543210', { source: 'checkout', orderId: 'COD-3' });

  let captured = null;
  const beforeTime = await runDailyMarketingSweep({
    now: new Date('2026-10-24T02:29:00.000Z'),
    sendFn: async (...args) => { captured = args; return { ok: true }; }
  });
  assert.equal(beforeTime.skipped, 'not-due');
  assert.equal(captured, null);

  const sent = await runDailyMarketingSweep({
    now: new Date('2026-10-24T02:30:00.000Z'),
    sendFn: async (...args) => { captured = args; return { ok: true }; }
  });
  assert.deepEqual({ attempted: sent.attempted, sent: sent.sent, failed: sent.failed }, { attempted: 1, sent: 1, failed: 0 });
  assert.equal(captured[0], '9876543210');
  assert.equal(captured[1], 'Daily note for customers');
  assert.match(captured[2], /\/unsubscribe\?token=/);
  const duplicate = await runDailyMarketingSweep({
    now: new Date('2026-10-24T02:31:00.000Z'),
    sendFn: async () => { throw new Error('must not resend'); }
  });
  assert.equal(duplicate.attempted, 0);
  assert.equal(duplicate.sent, 0);
});
