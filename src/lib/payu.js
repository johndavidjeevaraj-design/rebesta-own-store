import crypto from 'node:crypto';
import { config } from '../config.js';

function sha512(value) {
  return crypto.createHash('sha512').update(value, 'utf8').digest('hex');
}

function safeCompare(a, b) {
  const first = Buffer.from(String(a || ''), 'utf8');
  const second = Buffer.from(String(b || ''), 'utf8');
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

export function payuEnabled() {
  return Boolean(config.payu.key && config.payu.salt);
}

export function createPayuPayment(order) {
  if (!payuEnabled()) throw new Error('PayU merchant credentials are not configured');
  const amount = Number(order.totalInr).toFixed(2);
  const fields = {
    key: config.payu.key,
    txnid: order.id,
    amount,
    productinfo: 'Rebesta Fresh vegetable order',
    firstname: String(order.customer?.name || 'Customer').slice(0, 60),
    email: 'orders@rebestafresh.in',
    phone: order.customer?.phone,
    surl: `${config.appUrl}/api/payments/payu/callback`,
    furl: `${config.appUrl}/api/payments/payu/callback`,
    udf1: order.id,
    udf2: order.customer?.phone || '',
    udf3: '',
    udf4: '',
    udf5: ''
  };
  const hashSequence = [
    fields.key,
    fields.txnid,
    fields.amount,
    fields.productinfo,
    fields.firstname,
    fields.email,
    fields.udf1,
    fields.udf2,
    fields.udf3,
    fields.udf4,
    fields.udf5,
    '', '', '', '', '',
    config.payu.salt
  ].join('|');
  fields.hash = sha512(hashSequence);
  return { action: config.payu.url, method: 'POST', fields };
}

export function validatePayuResponse(payload, order) {
  if (!payuEnabled()) return { valid: false, reason: 'PayU credentials are not configured' };
  const amount = Number(order?.totalInr || 0).toFixed(2);
  if (!order) return { valid: false, reason: 'Order not found' };
  if (payload.key !== config.payu.key) return { valid: false, reason: 'Merchant key mismatch' };
  if (payload.txnid !== order.id) return { valid: false, reason: 'Transaction/order mismatch' };
  if (String(payload.amount) !== amount) return { valid: false, reason: `Amount mismatch: expected ${amount}` };
  if (String(payload.udf1 || '') !== order.id) return { valid: false, reason: 'udf1/order mismatch' };

  const reverseSequence = [
    config.payu.salt,
    payload.status,
    '', '', '', '', '',
    payload.udf5 || '',
    payload.udf4 || '',
    payload.udf3 || '',
    payload.udf2 || '',
    payload.udf1 || '',
    payload.email || '',
    payload.firstname || '',
    payload.productinfo || '',
    payload.amount || '',
    payload.txnid || '',
    payload.key || ''
  ].join('|');
  const expected = sha512(reverseSequence);
  if (!safeCompare(expected, payload.hash)) return { valid: false, reason: 'Invalid PayU response hash' };
  return { valid: true, success: String(payload.status).toLowerCase() === 'success' };
}

// Exported only for unit tests.
export const payuInternals = Object.freeze({ sha512, safeCompare });
