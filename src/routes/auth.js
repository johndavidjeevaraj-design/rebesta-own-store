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
import { otpAvailable, otpMode, sendOtpSms, sendManagedOtp, verifyManagedOtp, verifyWidgetToken } from '../sms.js';

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
  return { id: c.id, name: c.name, phone: c.phone, createdAt: c.createdAt, phoneVerified: !!c.phoneVerified };
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

/* Phone-VERIFIED signup (MSG91 widget): the account is only created after the
   customer proves ownership of the number with an SMS code. Same validation as
   /signup, plus the widget token is verified against MSG91 server-side and the
   verified phone (when MSG91 returns it) must match the requested number. */
router.post('/signup/verify', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many signup attempts from this device. Please try again in an hour.' }), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = cleanPhone(req.body?.phone);
  const password = String(req.body?.password || '');
  const token = String(req.body?.token || '');
  if (name.length < 2 || name.length > 60) return res.status(400).json({ ok: false, error: 'Please enter your name (2–60 characters).' });
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
  if (password.length < 6 || password.length > 72) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  if (!token) return res.status(400).json({ ok: false, error: 'Missing verification token — please request a new code.' });

  const customers = loadCustomers();
  if (customers.some(c => c.phone === phone)) {
    return res.status(409).json({ ok: false, error: 'This mobile number already has an account — try signing in instead.' });
  }

  const checked = await verifyWidgetToken(token);
  console.log(JSON.stringify({ event: 'otp.widgetVerify', context: 'signup', ok: checked.ok, verifiedPhone: checked.phone || null }));
  if (!checked.ok) return res.status(401).json({ ok: false, error: 'Verification failed — please try the code again.' });
  if (checked.phone && checked.phone !== phone) {
    console.error(JSON.stringify({ event: 'otp.widgetMismatch', context: 'signup', claimed: phone, verified: checked.phone }));
    return res.status(401).json({ ok: false, error: 'Verification failed — please try again.' });
  }

  const now = new Date().toISOString();
  const customer = {
    id: `RC-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    name, phone,
    pass: hashPassword(password),
    phoneVerified: true,
    phoneVerifiedAt: now,
    createdAt: now
  };
  customers.push(customer);
  saveCustomers(customers);
  setSession(res, req, customer);
  console.log(JSON.stringify({ event: 'auth.signupVerified', phone }));
  res.json({ ok: true, customer: publicCustomer(customer) });
});

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 12, message: 'Too many sign-in attempts. Please wait 15 minutes.' }), (req, res) => {
  const phone = cleanPhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (!phone || !password) return res.status(400).json({ ok: false, error: 'Enter your mobile number and password.' });
  const customer = loadCustomers().find(c => c.phone === phone);
  if (!customer || !customer.pass || !verifyPassword(password, customer.pass)) {
    return res.status(401).json({ ok: false, error: 'Wrong mobile number or password.' });
  }
  setSession(res, req, customer);
  res.json({ ok: true, customer: publicCustomer(customer) });
});

/* ---------- one-time codes (in-memory: 10-minute lifetime, restart just means re-request) ---------- */
const OTP_MS = 10 * 60 * 1000;      // code valid 10 minutes
const OTP_RESEND_MS = 60 * 1000;    // min 60s between sends to the same number
const OTP_MAX_ATTEMPTS = 5;         // wrong entries before the code is void
const pending = new Map();          // phone -> { hash, expiresAt, sentAt, attempts }

function otpHash(phone, code) {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/* ---------- OTP sign-in (offered only when an SMS sender is configured) ---------- */
router.get('/otp/available', (req, res) => {
  res.json({ ok: true, enabled: otpAvailable(), mode: otpMode() || null });
});

router.post('/otp/request', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many code requests. Please wait 15 minutes.' }), async (req, res) => {
  const phone = cleanPhone(req.body?.phone);
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
  if (!otpAvailable()) return res.status(503).json({ ok: false, error: 'OTP sign-in is not set up yet — please use your password.' });
  if (otpMode() === 'widget') return res.status(503).json({ ok: false, error: 'OTP is sent from the page widget — refresh and use the Mobile OTP tab.' });

  // Unknown number → refuse BEFORE spending an SMS (probing numbers costs real money).
  const customer = loadCustomers().find(c => c.phone === phone);
  if (!customer) return res.status(404).json({ ok: false, error: 'No account with this number yet — please create an account first.' });

  const existing = pending.get(phone);
  if (existing && Date.now() - existing.sentAt < OTP_RESEND_MS) {
    const wait = Math.ceil((OTP_RESEND_MS - (Date.now() - existing.sentAt)) / 1000);
    return res.status(429).json({ ok: false, error: `Code already sent — it should reach you in a moment. You can resend in ${wait}s.` });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const managed = otpMode() === 'managed';
  const entry = { hash: otpHash(phone, code), expiresAt: Date.now() + OTP_MS, sentAt: Date.now(), attempts: 0 };
  if (managed) { entry.managed = true; delete entry.hash; }

  if (managed) {
    const sent = await sendManagedOtp(phone);
    if (!sent.ok) {
      pending.delete(phone);
      console.error(JSON.stringify({ event: 'otp.sendFailed', phone, error: sent.error }));
      return res.status(502).json({ ok: false, error: 'Could not send the SMS right now. Please try again in a minute.' });
    }
    entry.verificationId = sent.verificationId;
    pending.set(phone, entry);
    return res.json({ ok: true, expiresInSeconds: OTP_MS / 1000 });
  }

  pending.set(phone, entry);
  const sent = await sendOtpSms(phone, code);
  if (!sent.ok) {
    pending.delete(phone);
    console.error(JSON.stringify({ event: 'otp.sendFailed', phone, error: sent.error }));
    return res.status(502).json({ ok: false, error: 'Could not send the SMS right now. Please try again in a minute.' });
  }
  const out = { ok: true, expiresInSeconds: OTP_MS / 1000 };
  if (sent.devCode) out.devCode = sent.devCode; // dev sender only — never present for real gateways
  res.json(out);
});

router.post('/otp/verify', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Please wait 15 minutes.' }), async (req, res) => {
  const phone = cleanPhone(req.body?.phone);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (!phone || code.length !== 6) return res.status(400).json({ ok: false, error: 'Enter the 6-digit code from the SMS.' });

  const entry = pending.get(phone);
  if (!entry) return res.status(400).json({ ok: false, error: 'No code was sent — tap “Send code” first.' });
  if (Date.now() > entry.expiresAt || entry.attempts >= OTP_MAX_ATTEMPTS) {
    pending.delete(phone);
    return res.status(400).json({ ok: false, error: 'That code expired — send a new one.' });
  }

  if (entry.managed) {
    const checked = await verifyManagedOtp(entry.verificationId, code);
    if (!checked.ok) {
      entry.attempts += 1;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) pending.delete(phone);
      console.error(JSON.stringify({ event: 'otp.verifyFailed', phone, error: checked.error }));
      return res.status(401).json({ ok: false, error: 'That code didn’t match. Check the SMS and try again.' });
    }
  } else if (otpHash(phone, code) !== entry.hash) {
    entry.attempts += 1;
    if (entry.attempts >= OTP_MAX_ATTEMPTS) pending.delete(phone);
    return res.status(401).json({ ok: false, error: 'That code didn’t match. Check the SMS and try again.' });
  }
  pending.delete(phone); // one code, one use

  const customer = loadCustomers().find(c => c.phone === phone);
  if (!customer) return res.status(404).json({ ok: false, error: 'No account with this number yet — please create an account first.' });
  setSession(res, req, customer);
  res.json({ ok: true, customer: publicCustomer(customer) });
});

/* Widget login: the page's MSG91 SDK already verified the code and produced an
   access token. We verify that token SERVER-SIDE with MSG91, bind it to the
   phone (when MSG91 returns the number), then issue our session. */
router.post('/otp/widget', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Please wait 15 minutes.' }), async (req, res) => {
  const phone = cleanPhone(req.body?.phone);
  const token = String(req.body?.token || '');
  if (!phone || !token) return res.status(400).json({ ok: false, error: 'Missing phone or verification token.' });

  const customer = loadCustomers().find(c => c.phone === phone);

  const checked = await verifyWidgetToken(token);
  console.log(JSON.stringify({ event: 'otp.widgetVerify', context: customer ? 'signin' : 'signup', ok: checked.ok, verifiedPhone: checked.phone || null }));
  if (!checked.ok) return res.status(401).json({ ok: false, error: 'Verification failed — please try the code again.' });
  if (checked.phone && checked.phone !== phone) {
    console.error(JSON.stringify({ event: 'otp.widgetMismatch', context: customer ? 'signin' : 'signup', claimed: phone, verified: checked.phone }));
    return res.status(401).json({ ok: false, error: 'Verification failed — please try again.' });
  }

  /* existing number → straight in */
  if (customer) {
    /* a successful OTP sign-in proves number ownership — backfill the flag for older accounts */
    if (!customer.phoneVerified) {
      const all = loadCustomers();
      const fresh = all.find(c => c.phone === phone);
      if (fresh && !fresh.phoneVerified) {
        fresh.phoneVerified = true;
        fresh.phoneVerifiedAt = new Date().toISOString();
        saveCustomers(all);
      }
    }
    setSession(res, req, customer);
    return res.json({ ok: true, isNew: false, customer: publicCustomer(customer) });
  }

  /* unknown number → the code proved ownership; hand back a short-lived signed
     token that lets the client complete account creation (name step) — the
     account itself is only created in /otp/complete-signup, server-side. */
  const verifiedToken = signToken({ purpose: 'otp-signup', phone, exp: Date.now() + 15 * 60 * 1000 });
  res.json({ ok: true, isNew: true, verifiedToken });
});

/* finish an OTP-verified signup: create the account for a number whose code was
   just verified (verifiedToken is HMAC-signed by us, 15-minute lifetime). */
router.post('/otp/complete-signup', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many attempts. Please try again in an hour.' }), (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 60) return res.status(400).json({ ok: false, error: 'Please tell us your name (2–60 characters).' });
  const vt = readToken(String(req.body?.verifiedToken || ''));
  if (!vt || vt.purpose !== 'otp-signup' || !cleanPhone(vt.phone)) {
    return res.status(401).json({ ok: false, error: 'Verification expired — please request a new code.' });
  }
  const phone = cleanPhone(vt.phone);
  const customers = loadCustomers();
  if (customers.some(c => c.phone === phone)) {
    return res.status(409).json({ ok: false, error: 'This mobile number already has an account — sign in with your code instead.' });
  }
  const now = new Date().toISOString();
  const customer = {
    id: `RC-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    name, phone,
    pass: null,                    /* OTP-only account — password login simply unavailable */
    phoneVerified: true,
    phoneVerifiedAt: now,
    createdAt: now
  };
  customers.push(customer);
  saveCustomers(customers);
  setSession(res, req, customer);
  console.log(JSON.stringify({ event: 'auth.signupVerified', phone }));
  res.json({ ok: true, isNew: true, customer: publicCustomer(customer) });
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
