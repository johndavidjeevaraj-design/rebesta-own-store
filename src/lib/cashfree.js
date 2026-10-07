import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/* Cashfree hosted checkout (replaces the never-configured PayU path).
   Keys live in data/cashfree-config.json (gitignored) so the owner can paste
   them in the admin UI without SSH — same pattern as the SMS gateway config. */

const CF_FILE = () => path.join(config.dataDir, 'cashfree-config.json');
const API_VERSION = '2025-01-01';

export function loadCashfreeConfig() {
  try { return JSON.parse(fs.readFileSync(CF_FILE(), 'utf8')); } catch { return null; }
}

export function cashfreeEnabled() {
  const c = loadCashfreeConfig() || {};
  return Boolean((c.mode === 'live' || c.mode === 'test') && c.appId && c.secretKey);
}

function baseUrl() {
  const c = loadCashfreeConfig() || {};
  return c.mode === 'live' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
}

async function cf(pathname, init = {}) {
  const c = loadCashfreeConfig() || {};
  if (!cashfreeEnabled()) throw new Error('Cashfree credentials are not configured');
  const res = await fetch(baseUrl() + pathname, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-version': API_VERSION,
      'x-client-id': String(c.appId || ''),
      'x-client-secret': String(c.secretKey || '')
    },
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.message || data.error_message || `Cashfree HTTP ${res.status}`;
    throw new Error(String(message).slice(0, 300));
  }
  return data;
}

export function onlinePaymentsWanted() {
  const c = loadCashfreeConfig() || {};
  return { mode: c.mode || null, appId: c.appId || null, hasSecretKey: Boolean(c.secretKey) };
}

/* Create a Cashfree order for a placed Rebesta order → payment_session_id.
   The browser opens the Cashfree hosted checkout with the JS SDK and is sent
   back to our callback with ?order_id=… when the payment finishes. */
export async function createCashfreePayment(order) {
  const phone = String(order.customer?.phone || '').replace(/\D/g, '');
  const data = await cf('/pg/orders', {
    method: 'POST',
    body: JSON.stringify({
      order_id: order.id,
      order_amount: Number(Number(order.totalInr || 0).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${phone || 'guest'}`,
        customer_name: String(order.customer?.name || 'Customer').slice(0, 60),
        customer_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(order.customer?.email || '')) ? order.customer.email : 'orders@rebestafresh.in',
        customer_phone: '91' + phone
      },
      order_meta: {
        return_url: `${config.appUrl}/api/payments/cashfree/callback?order_id={order_id}`
      },
      order_note: 'Rebesta Fresh vegetable order'
    })
  });
  if (!data.payment_session_id) throw new Error('Cashfree did not return a payment session');
  const mode = (loadCashfreeConfig() || {}).mode || 'test';
  return { type: 'cashfree', sessionId: data.payment_session_id, cfOrderId: String(data.cf_order_id || ''), mode };
}

/* Authoritative status check — never trust the redirect query params. */
export async function getCashfreeOrder(orderId) {
  return cf('/pg/orders/' + encodeURIComponent(String(orderId || '')));
}
