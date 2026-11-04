import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebesta-customer-security-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.ADMIN_KEY = 'customer-security-test-key';
process.env.APP_URL = 'http://127.0.0.1:3000';

const ownerPhone = '9876543210';
const otherPhone = '9123456789';
const password = 'secure-test-password';
const salt = crypto.randomBytes(16).toString('hex');
const pass = `${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;

fs.writeFileSync(path.join(dataDir, 'customers.json'), JSON.stringify([
  { id: 'OWNER', name: 'Owner Customer', phone: ownerPhone, pass, phoneVerified: true },
  { id: 'OTHER', name: 'Other Customer', phone: otherPhone, pass, phoneVerified: true }
], null, 2));
fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify([
  { id: 'OWNER-ORDER', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'PAY_ON_DELIVERY', customer: { name: 'Owner Customer', phone: ownerPhone }, items: [], totalInr: 100, history: [] },
  { id: 'OTHER-ORDER', status: 'PLACED', paymentMethod: 'cod', paymentStatus: 'PAY_ON_DELIVERY', customer: { name: 'Other Customer', phone: otherPhone }, items: [], totalInr: 200, history: [] }
], null, 2));
fs.writeFileSync(path.join(dataDir, 'subscriptions.json'), JSON.stringify([
  { id: 'SUB-OWNER', phone: ownerPhone, name: 'Owner Customer', status: 'ACTIVE', items: [], address: {}, createdAt: new Date().toISOString() },
  { id: 'SUB-OTHER', phone: otherPhone, name: 'Other Customer', status: 'ACTIVE', items: [], address: {}, createdAt: new Date().toISOString() }
], null, 2));

const { createStoreApp } = await import('../src/app.js');
const server = createStoreApp().listen(0, '127.0.0.1');
let baseUrl;
let ownerCookie;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: ownerPhone, password })
  });
  assert.equal(login.status, 200);
  ownerCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(ownerCookie);
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function request(pathname, { method = 'GET', cookie, body, origin, fetchSite } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
      ...(fetchSite ? { 'sec-fetch-site': fetchSite } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}

test('order history and subscription reads require a verified session, not a query phone', async () => {
  assert.equal((await request('/api/orders/history?phone=' + ownerPhone)).status, 401);
  assert.equal((await request('/api/subscriptions?phone=' + ownerPhone)).status, 401);

  const history = await request('/api/orders/history?phone=' + otherPhone, { cookie: ownerCookie });
  assert.equal(history.status, 200);
  assert.deepEqual(history.body.orders.map(order => order.id), ['OWNER-ORDER']);

  const subscriptions = await request('/api/subscriptions?phone=' + otherPhone, { cookie: ownerCookie });
  assert.equal(subscriptions.status, 200);
  assert.deepEqual(subscriptions.body.subscriptions.map(subscription => subscription.id), ['SUB-OWNER']);
});

test('subscription mutations and order cancellation are bound to the signed-in phone', async () => {
  const forbiddenCreation = await request('/api/subscriptions', {
    method: 'POST', cookie: ownerCookie, body: { orderId: 'OTHER-ORDER', phone: otherPhone, weekday: 1 }
  });
  assert.equal(forbiddenCreation.status, 403);

  const forbiddenSubscription = await request('/api/subscriptions/SUB-OTHER', {
    method: 'PATCH', cookie: ownerCookie, body: { phone: otherPhone, action: 'cancel' }
  });
  assert.equal(forbiddenSubscription.status, 403);

  const paused = await request('/api/subscriptions/SUB-OWNER', {
    method: 'PATCH', cookie: ownerCookie, body: { phone: otherPhone, action: 'pause' }
  });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.subscription.status, 'PAUSED');

  assert.equal((await request('/api/orders/OTHER-ORDER/cancel', {
    method: 'POST', cookie: ownerCookie, body: { phone: otherPhone }
  })).status, 403);

  const cancelled = await request('/api/orders/OWNER-ORDER/cancel', {
    method: 'POST', cookie: ownerCookie, body: { phone: otherPhone }
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.order.status, 'CANCELLED');
});

test('payment session, UPI QR and payment polling require the verified order owner', async () => {
  assert.equal((await request('/api/orders/OWNER-ORDER/pay', { method: 'POST' })).status, 401);
  assert.equal((await request('/api/orders/OWNER-ORDER/upi-qr', { method: 'POST' })).status, 401);
  assert.equal((await request('/api/orders/OWNER-ORDER/verify-payment', { cookie: ownerCookie })).status, 200);
  assert.equal((await request('/api/orders/OTHER-ORDER/pay', { method: 'POST', cookie: ownerCookie })).status, 403);
  assert.equal((await request('/api/orders/OTHER-ORDER/upi-qr', { method: 'POST', cookie: ownerCookie })).status, 403);
  assert.equal((await request('/api/orders/OTHER-ORDER/verify-payment', { cookie: ownerCookie })).status, 403);
  assert.equal((await request('/api/orders/OWNER-ORDER/verify-payment', {
    cookie: ownerCookie, origin: 'https://attacker.example'
  })).status, 403);
  assert.equal((await request('/api/orders/OWNER-ORDER/verify-payment', {
    cookie: ownerCookie, fetchSite: 'cross-site'
  })).status, 403);
});

test('customer mutation middleware blocks cross-origin cookie requests', async () => {
  const blocked = await request('/api/subscriptions/SUB-OWNER', {
    method: 'PATCH', cookie: ownerCookie, origin: 'https://attacker.example',
    body: { action: 'pause' }
  });
  assert.equal(blocked.status, 403);

  const blockedWithoutOrigin = await request('/api/subscriptions/SUB-OWNER', {
    method: 'PATCH', cookie: ownerCookie, fetchSite: 'cross-site',
    body: { action: 'pause' }
  });
  assert.equal(blockedWithoutOrigin.status, 403);

  const sameOrigin = await request('/api/subscriptions/SUB-OWNER', {
    method: 'PATCH', cookie: ownerCookie, origin: 'http://127.0.0.1:3000',
    body: { action: 'pause' }
  });
  assert.equal(sameOrigin.status, 200);
});

test('MSG91 widget signup fails closed when the verified phone is absent or mismatched', async () => {
  fs.writeFileSync(path.join(dataDir, 'sms-config.json'), JSON.stringify({ provider: 'msg91-widget', authKey: 'test-auth-key', widgetId: 'test-widget' }));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('api.msg91.com/api/v5/widget/verifyAccessToken')) {
        return new Response(JSON.stringify({ type: 'success' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    const missingPhone = await request('/api/auth/signup/verify', {
      method: 'POST',
      body: { name: 'New Customer', phone: '9000000001', password: 'secure-pass', token: 'test-widget-token' }
    });
    assert.equal(missingPhone.status, 401);

    globalThis.fetch = async (url, options) => {
      if (String(url).includes('api.msg91.com/api/v5/widget/verifyAccessToken')) {
        return new Response(JSON.stringify({ type: 'success', mobile: '919000000002' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    const mismatch = await request('/api/auth/signup/verify', {
      method: 'POST',
      body: { name: 'New Customer', phone: '9000000001', password: 'secure-pass', token: 'test-widget-token' }
    });
    assert.equal(mismatch.status, 401);
    // MSG91 documented success response: phone number in `message`
globalThis.fetch = async (url, options) => {
  if (String(url).includes('api.msg91.com/api/v5/widget/verifyAccessToken')) {
    return new Response(JSON.stringify({
      type: 'success',
      message: '919000000003'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  return originalFetch(url, options);
};

const successfulSignup = await request('/api/auth/signup/verify', {
  method: 'POST',
  body: {
    name: 'Successful Customer',
    phone: '9000000003',
    password: 'secure-pass',
    token: 'test-widget-token'
  }
});

assert.equal(successfulSignup.status, 200);
assert.equal(successfulSignup.body.ok, true);
assert.equal(successfulSignup.body.customer.phone, '9000000003');
assert.equal(successfulSignup.body.customer.phoneVerified, true);
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('api.msg91.com/api/v5/widget/verifyAccessToken')) {
        return new Response(JSON.stringify({ type: 'success' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(url, options);
    };
    const signinMissingPhone = await request('/api/auth/otp/widget', {
      method: 'POST',
      body: { phone: ownerPhone, token: 'test-widget-token' }
    });
    assert.equal(signinMissingPhone.status, 401);

    const customers = JSON.parse(fs.readFileSync(path.join(dataDir, 'customers.json'), 'utf8'));
    assert.equal(customers.some(customer => customer.phone === '9000000001'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
