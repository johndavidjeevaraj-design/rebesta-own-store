/* Rebesta Fresh — customer accounts (optional, never required to shop).
   Phone + password. scrypt-hashed passwords, HMAC-signed httpOnly cookie,
   customers stored in data/customers.json (same pattern as the rest of the store). */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ordersByPhone } from '../lib/store.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = express.Router();

const CUSTOMERS_FILE = path.join(config.dataDir, 'customers.json');
const SECRET_FILE = path.join(config.dataDir, 'auth-secret.json');
const COOKIE = 'rebesta_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ---------- tiny storage (mirrors store.js conventions) ---------- */
function loadCustomers() {
  try { return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8')); } catch { return []; }
}
function saveCustomers(list) {
  fs.mkdirSync(path.dirname(CUSTOMERS_FILE), { recursive: true });
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(list, null, 2));
}
function getSecret() {
  try { return JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8')).secret; }
  catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, JSON.stringify({ secret }));
    return secret;
  }
}

/* ---------- passwords: scrypt with per-customer salt ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, want] = String(stored).split('$');
    const got = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch { return false; }
}

/* ---------- signed session cookie (no server session file needed) ---------- */
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    const want = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function currentCustomer(req) {
  const payload = readToken(parseCookies(req)[COOKIE]);
  if (!payload) return null;
  return loadCustomers().find(c => c.id === payload.uid) || null;
}
function setSession(res, req, customer) {
  const token = signToken({ uid: customer.id, iat: Date.now(), exp: Date.now() + SESSION_MS });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/* ---------- validation ---------- */
function cleanPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
function publicCustomer(c) {
  return { id: c.id, name: c.name, phone: c.phone, createdAt: c.createdAt };
}

/* ---------- routes ---------- */
router.get('/me', (req, res) => {
  const customer = currentCustomer(req);
  res.json({ ok: true, customer: customer ? publicCustomer(customer) : null });
});

router.post('/signup', rateLimit({ windowMs: 60 * 60 * 1000, max: 8, message: 'Too many signup attempts from this device. Please try again in an hour.' }), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = cleanPhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (name.length < 2 || name.length > 60) return res.status(400).json({ ok: false, error: 'Please enter your name (2–60 characters).' });
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });

  const customers = loadCustomers();
  if (customers.some(c => c.phone === phone)) {
    return res.status(409).json({ ok: false, error: 'This mobile number already has an account — try signing in instead.' });
  }
  const customer = {
    id: `RC-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    name, phone,
    pass: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  customers.push(customer);
  saveCustomers(customers);
  setSession(res, req, customer);
  res.json({ ok: true, customer: publicCustomer(customer) });
});

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 12, message: 'Too many sign-in attempts. Please wait 15 minutes.' }), (req, res) => {
  const phone = cleanPhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (!phone || !password) return res.status(400).json({ ok: false, error: 'Enter your mobile number and password.' });
  const customer = loadCustomers().find(c => c.phone === phone);
  if (!customer || !verifyPassword(password, customer.pass)) {
    return res.status(401).json({ ok: false, error: 'Wrong mobile number or password.' });
  }
  setSession(res, req, customer);
  res.json({ ok: true, customer: publicCustomer(customer) });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/* Order history for the signed-in customer (phone matched server-side — never trusted from the client). */
router.get('/orders', (req, res) => {
  const customer = currentCustomer(req);
  if (!customer) return res.status(401).json({ ok: false, error: 'Please sign in first.' });
  res.json({ ok: true, orders: ordersByPhone(customer.phone) });
});

export { router };
