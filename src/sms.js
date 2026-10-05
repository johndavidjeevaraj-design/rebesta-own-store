/* Rebesta Fresh — OTP SMS delivery (pluggable sender, zero dependencies).
   Reads data/sms-config.json FRESH on every request, so you can drop the
   gateway credentials onto the server and OTP sign-in goes live instantly —
   no restart, no redeploy.

   ── Option 1: Message Central VerifyNow (recommended — NO DLT needed) ──
   data/sms-config.json (gitignored):
   {
     "provider": "messagecentral",
     "customerId": "C-XXXXXXXX",          // dashboard → profile
     "email": "you@example.com",          // the account's login email
     "password": "your account password"  // used only to generate their API token
   }
   They generate + verify the code themselves (managed OTP) over pre-registered
   DLT-free templates; the SMS shows a generic sender, not "REBEST".

   ── Option 2 (CHOSEN): MSG91 SendOTP v5 ──
   Their DEFAULT OTP template + sender need NO DLT registration of your own.
   {
     "provider": "msg91",
     "authKey":    "your MSG91 auth key (dashboard → Settings → API)",
     "templateId": "optional — MSG91 dashboard OTP template id (default template used if omitted)"
   }
   We generate + verify the code ourselves; MSG91 only delivers the SMS.
   (A branded 'REBEST' sender would need your own DLT, ~₹5,900 — not doing that.)

   For local dev only: { "provider": "dev" } — we generate the code, log it to
   the server console (and return it to the page so the flow can be tested).
   With no config file at all, OTP sign-in is simply hidden from customers. */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const SMS_CONFIG_FILE = path.join(config.dataDir, 'sms-config.json');

export function loadSmsConfig() {
  try { return JSON.parse(fs.readFileSync(SMS_CONFIG_FILE, 'utf8')); } catch { return null; }
}

/* OTP sign-in is only offered when a working sender is configured. */
export function otpAvailable() {
  const c = loadSmsConfig();
  if (!c) return false;
  if (c.provider === 'dev') return true;
  if (c.provider === 'messagecentral') return !!(c.customerId && c.email && c.password);
  return c.provider === 'msg91' && !!c.authKey;
}

/* 'own'    → we generate + verify the code (dev, msg91)
   'managed' → gateway generates + verifies (messagecentral) */
export function otpMode() {
  const c = loadSmsConfig() || {};
  if (c.provider === 'dev' || c.provider === 'msg91') return 'own';
  if (c.provider === 'messagecentral') return 'managed';
  return null;
}

/* Send the OTP. Returns { ok, devCode? } — throws nothing (errors as {ok:false,error}). */
export async function sendOtpSms(phone, code, cfgOverride) {
  const c = cfgOverride || loadSmsConfig() || {};
  if (c.provider === 'dev') {
    console.log(JSON.stringify({ event: 'otp.devcode', phone, code }));
    return { ok: true, devCode: code };
  }
  if (c.provider === 'msg91') return sendMsg91(c, phone, code);
  return { ok: false, error: 'SMS is not configured yet.' };
}

/* ---------- Message Central VerifyNow (managed OTP, DLT-free) ---------- */
let mcToken = null; // { token, fetchedAt } — their token lives ~24h, cached in memory
export function clearMcToken() { mcToken = null; }
async function mcGetToken(c) {
  if (mcToken && Date.now() - mcToken.fetchedAt < 20 * 60 * 60 * 1000) return mcToken.token;
  const qs = new URLSearchParams({
    customerId: c.customerId, key: Buffer.from(String(c.password)).toString('base64'),
    scope: 'NEW', country: '91', email: c.email
  });
  const res = await fetch(`https://cpaas.messagecentral.com/auth/v1/authentication/token?${qs}`, {
    headers: { accept: '*/*' }, signal: AbortSignal.timeout(10000)
  });
  const data = await res.json().catch(() => ({}));
  const token = data.token || data.data?.token;
  if (!res.ok || !token) throw new Error(`token: ${data.error || data.message || `HTTP ${res.status}`}`);
  mcToken = { token, fetchedAt: Date.now() };
  return token;
}

/* Ask Message Central to send THEIR OTP to the phone. Returns { ok, verificationId }.
   cfgOverride lets the admin test unsaved credentials. */
export async function sendManagedOtp(phone, cfgOverride) {
  const c = cfgOverride || loadSmsConfig() || {};
  try {
    const token = await mcGetToken(c);
    const qs = new URLSearchParams({ countryCode: '91', flowType: 'SMS', mobileNumber: phone, otpLength: '6' });
    const res = await fetch(`https://cpaas.messagecentral.com/verification/v3/send?${qs}`, {
      method: 'POST', headers: { authToken: token }, signal: AbortSignal.timeout(12000)
    });
    const data = await res.json().catch(() => ({}));
    const vid = data.verificationId ?? data.data?.verificationId;
    if (res.ok && vid) return { ok: true, verificationId: String(vid) };
    if (res.status === 401 || /token/i.test(String(data.error || data.message || ''))) mcToken = null; // stale token → retry next time
    return { ok: false, error: `MessageCentral: ${data.error || data.message || `HTTP ${res.status}`}` };
  } catch (error) {
    mcToken = null;
    return { ok: false, error: `MessageCentral unreachable: ${error.message}` };
  }
}

/* Ask Message Central to validate the code the customer typed. Returns { ok, error? }. */
export async function verifyManagedOtp(verificationId, code) {
  const c = loadSmsConfig() || {};
  try {
    const token = await mcGetToken(c);
    const res = await fetch(`https://cpaas.messagecentral.com/verification/v3/validateOtp?verificationId=${encodeURIComponent(verificationId)}&code=${encodeURIComponent(code)}`, {
      headers: { authToken: token }, signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && (data.verified === true || data.data?.verified === true || /success|accepted/i.test(String(data.status || data.type || '')));
    if (ok) return { ok: true };
    return { ok: false, error: `MessageCentral: ${data.error || data.message || `HTTP ${res.status}`}` };
  } catch (error) {
    return { ok: false, error: `MessageCentral unreachable: ${error.message}` };
  }
}

/* Wallet balance for an MSG91 authkey (their send API accepts ANY key without
   validating — failures happen silently at delivery. This gives a real signal:
   a number > 0 means the key works AND has credits; 0 means key wrong or wallet empty.) */
export async function msg91Balance(authKey) {
  try {
    const res = await fetch(`https://control.msg91.com/api/balance.php?authkey=${encodeURIComponent(String(authKey))}&type=1`, { signal: AbortSignal.timeout(10000) });
    const text = (await res.text()).trim();
    const n = Number(text);
    return Number.isFinite(n) ? { ok: true, balance: n } : { ok: false, error: text.slice(0, 120) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/* ---------- MSG91 SendOTP v5 (their default OTP template — no DLT of our own) ----------
   We pass OUR generated code as the otp param; MSG91's template delivers it.
   Verification stays local (hash compare) — no API call needed at verify time. */
async function sendMsg91(c, phone, code) {
  try {
    const qs = new URLSearchParams({ mobile: `91${phone}`, otp: String(code), otp_expiry: '10' });
    if (c.templateId) qs.set('template_id', String(c.templateId));
    const res = await fetch('https://api.msg91.com/api/v5/otp?' + qs, {
      method: 'POST',
      headers: { authkey: String(c.authKey) },
      signal: AbortSignal.timeout(12000)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && String(data.type || '').toLowerCase() !== 'error') return { ok: true };
    return { ok: false, error: `MSG91: ${data.message || `HTTP ${res.status}`}` };
  } catch (error) {
    return { ok: false, error: `MSG91 unreachable: ${error.message}` };
  }
}
