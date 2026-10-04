/* Rebesta Fresh — OTP SMS delivery (pluggable sender, zero dependencies).
   Reads data/sms-config.json FRESH on every request, so you can drop the
   gateway credentials onto the server and OTP sign-in goes live instantly —
   no restart, no redeploy.

   data/sms-config.json (gitignored) — for real SMS via MSG91:
   {
     "provider": "msg91",
     "authKey":  "your MSG91 auth key (dashboard → Settings → API)",
     "sender":   "6-char DLT-approved sender ID, e.g. REBEST",
     "route":    "dlt_transactional",
     "templateId": "MSG91 template/flow id for the OTP template",
     "otpVariable": "OTP"
   }

   For local dev only: { "provider": "dev" } — the code is logged to the
   server console (and returned to the page so the flow can be tested).
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
  return c.provider === 'msg91' && !!c.authKey && !!c.sender;
}

/* Send the OTP. Returns { ok, devCode? } — throws nothing (errors as {ok:false,error}). */
export async function sendOtpSms(phone, code) {
  const c = loadSmsConfig() || {};
  if (c.provider === 'dev') {
    console.log(JSON.stringify({ event: 'otp.devcode', phone, code }));
    return { ok: true, devCode: code };
  }
  if (c.provider === 'msg91') return sendMsg91(c, phone, code);
  return { ok: false, error: 'SMS is not configured yet.' };
}

/* MSG91 v5 SMS API — transactional DLT route, one recipient, one variable.
   Template text/variables are managed in the MSG91 dashboard; we only pass
   the mobile number and the OTP value for the template's ##OTP## variable. */
async function sendMsg91(c, phone, code) {
  try {
    const body = {
      route: c.route || 'dlt_transactional',
      sender: c.sender,
      numbers: [{ mobiles: `91${phone}`, [c.otpVariable || 'OTP']: String(code) }]
    };
    if (c.templateId) body.template_id = String(c.templateId);
    const res = await fetch('https://api.msg91.com/api/v5/sms/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: String(c.authKey) },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && String(data.type || '').toLowerCase() !== 'error') return { ok: true };
    return { ok: false, error: `MSG91: ${data.message || `HTTP ${res.status}`}` };
  } catch (error) {
    return { ok: false, error: `MSG91 unreachable: ${error.message}` };
  }
}
