/* Rebesta Fresh — OTP SMS delivery (pluggable sender, zero dependencies).
   Reads data/sms-config.json FRESH on every request, so you can drop the
   gateway credentials onto the server and OTP sign-in goes live instantly —
   no restart, no redeploy.

   ── Option 0 (LIVE): MSG91 OTP Widget (DLT-free, generic template) ──
   MSG91's own docs: "A default SMS template is being provided by MSG91 to
   use till your template is not approved on DLT." The widget SDK (client
   side) does the sending via their default template; our server only
   verifies the resulting access token. Captcha is built into the widget.
   {
     "provider": "msg91-widget",
     "authKey":   "account authkey (server-side token verification)",
     "widgetId":  "widget id (public by design — shown in the page)",
     "tokenAuth": "widget token (public by design — used by the page SDK)"
   }

   ── Option 1: Message Central VerifyNow (NO DLT, but enterprise USD pricing) ──
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

/* Safe status only — never return the WhatsApp API key to the Admin UI. */
export function getMarketingWhatsAppConfigStatus() {
  const configNow = loadSmsConfig() || {};
  const marketing = configNow.whatsapp?.marketing || {};
  const integratedNumber = String(marketing.integratedNumber || '').replace(/\D/g, '');
  const templateName = String(marketing.templateName || '').trim();
  const authKey = String(marketing.authkey || configNow.whatsapp?.authkey || configNow.authKey || '').trim();
  const configured = /^91[6-9]\d{9}$/.test(integratedNumber)
    && /^[a-z0-9_]{1,100}$/.test(templateName)
    && Boolean(authKey);
  return {
    configured,
    integratedNumber: /^91[6-9]\d{9}$/.test(integratedNumber) ? integratedNumber : '',
    templateName: /^[a-z0-9_]{1,100}$/.test(templateName) ? templateName : '',
    language: String(marketing.language || 'en').slice(0, 10),
    hasAuthKey: Boolean(authKey)
  };
}

/* Save only the marketing-template connection, preserving OTP/order-message
   credentials and settings in data/sms-config.json. Blank authKey retains the
   stored key; the key is never returned by the status endpoint. */
export function saveMarketingWhatsAppConfig(input = {}) {
  const current = loadSmsConfig() || {};
  const body = input || {};
  if (body.clear === true) {
    if (current.whatsapp) {
      delete current.whatsapp.marketing;
      if (!Object.keys(current.whatsapp).length) delete current.whatsapp;
    }
  } else {
    const previous = current.whatsapp?.marketing || {};
    const next = { ...previous };
    if (body.integratedNumber !== undefined) {
      const number = String(body.integratedNumber || '').replace(/\D/g, '');
      if (number && !/^91[6-9]\d{9}$/.test(number)) throw new Error('WhatsApp number must be 91 followed by a valid 10-digit Indian mobile number.');
      if (number) next.integratedNumber = number;
      else delete next.integratedNumber;
    }
    if (body.templateName !== undefined) {
      const templateName = String(body.templateName || '').trim();
      if (templateName && !/^[a-z0-9_]{1,100}$/.test(templateName)) throw new Error('Template name must use lowercase letters, numbers and underscores.');
      if (templateName) next.templateName = templateName;
      else delete next.templateName;
    }
    if (body.language !== undefined) {
      const language = String(body.language || 'en').trim();
      if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) throw new Error('Enter a valid template language code, such as en or en_US.');
      next.language = language;
    }
    const authKey = String(body.authKey || '').trim();
    if (authKey) next.authkey = authKey.slice(0, 500);
    if (body.clearAuthKey === true) delete next.authkey;
    current.whatsapp = { ...(current.whatsapp || {}), marketing: next };
  }
  fs.mkdirSync(path.dirname(SMS_CONFIG_FILE), { recursive: true });
  const temp = `${SMS_CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(current, null, 2), { mode: 0o600 });
  fs.renameSync(temp, SMS_CONFIG_FILE);
  return getMarketingWhatsAppConfigStatus();
}

/* One approved WhatsApp Marketing template is sent per recipient/day. The
   provider template must contain {{1}} for the Admin-authored copy and {{2}}
   for the one-click unsubscribe URL. */
export async function sendMarketingWhatsAppTemplate(phone, message, unsubscribeUrl) {
  const configNow = loadSmsConfig() || {};
  const marketing = configNow.whatsapp?.marketing || {};
  const status = getMarketingWhatsAppConfigStatus();
  const digits = String(phone || '').replace(/\D/g, '');
  const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!status.configured) return { ok: false, reason: 'not-configured' };
  if (!/^[6-9]\d{9}$/.test(normalized)) return { ok: false, reason: 'invalid-phone' };
  const bodyText = String(message || '').trim();
  const unsubscribeLink = String(unsubscribeUrl || '').trim();
  if (!bodyText || bodyText.length > 1024 || !unsubscribeLink || unsubscribeLink.length > 1000) return { ok: false, reason: 'invalid-template-values' };
  const authkey = String(marketing.authkey || configNow.whatsapp?.authkey || configNow.authKey || '');
  try {
    const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey },
      body: JSON.stringify({
        integrated_number: status.integratedNumber,
        content_type: 'template',
        payload: {
          messaging_product: 'whatsapp',
          type: 'template',
          template: {
            name: status.templateName,
            language: { code: status.language || 'en', policy: 'deterministic' },
            to_and_components: [{
              to: ['91' + normalized],
              components: {
                body_1: { type: 'text', value: bodyText },
                body_2: { type: 'text', value: unsubscribeLink }
              }
            }]
          }
        }
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      const error = (await response.text().catch(() => '')).slice(0, 240);
      return { ok: false, reason: `http-${response.status}`, error };
    }
    console.log(JSON.stringify({ event: 'whatsapp.marketing.sent', recipientLast4: normalized.slice(-4), template: status.templateName }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'provider-error', error: String(error?.message || error).slice(0, 200) };
  }
}

/* OTP sign-in is only offered when a working sender is configured. */
export function otpAvailable() {
  const c = loadSmsConfig();
  if (!c) return false;
  if (c.provider === 'dev') return true;
  if (c.provider === 'messagecentral') return !!(c.customerId && c.email && c.password);
  if (c.provider === 'msg91-widget') return !!(c.authKey && c.widgetId);
  return c.provider === 'msg91' && !!c.authKey;
}

/* 'own'    → we generate + verify the code (dev, msg91)
   'managed' → gateway generates + verifies (messagecentral) */
export function otpMode() {
  const c = loadSmsConfig() || {};
  if (c.provider === 'dev' || c.provider === 'msg91') return 'own';
  if (c.provider === 'messagecentral') return 'managed';
  if (c.provider === 'msg91-widget') return 'widget';
  return null;
}

/* Verify a widget access token (JWT from the client SDK) against MSG91.
   Returns { ok, phone? } — phone extracted when MSG91's response includes it,
   so the caller can enforce that the token matches the claimed number. */
export async function verifyWidgetToken(token) {
  const c = loadSmsConfig() || {};
  try {
    const res = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authkey: String(c.authKey), 'access-token': String(token) }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    const raw = JSON.stringify(data);
    console.log(JSON.stringify({ event: 'otp.widgetVerify', status: res.status, body: raw.slice(0, 400) }));
    const ok = res.ok && String(data.type || '').toLowerCase() === 'success';
    const phone = data.mobile || data.phone || data.identifier || data.data?.mobile || data.data?.phone || null;
    const digits = phone ? String(phone).replace(/\D/g, '').slice(-10) : null;
    return { ok, phone: /^[6-9]\d{9}$/.test(digits || '') ? digits : null, error: ok ? null : (data.message || `HTTP ${res.status}`) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
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

/* ── Order confirmation push (fires on payment success / COD order placed) ──
   Channel 1 (CHOSEN — no DLT): WhatsApp template message via MSG91.
     MSG91 API: POST /api/v5/whatsapp/whatsapp-outbound-message/bulk/
     (WhatsApp needs no Indian DLT registration — only a Meta-approved
      template + a number connected in the MSG91 WhatsApp panel.)
     Enable by adding to data/sms-config.json:
       "whatsapp": {
         "integratedNumber": "919XXXXXXXXX",     // WhatsApp business number connected in MSG91
         "templateName": "order_confirmed",      // approved utility template name (lowercase_with_underscores)
         "language": "en",                       // optional (default en)
         "authkey": "..."                        // optional — falls back to main authKey
       }
     Template body variables: {{1}}=order id, {{2}}=amount, {{3}}=status.
   Channel 2 (LATER — needs DLT): MSG91 SMS flow. Same function, add:
       "orderSms": { "flowId": "<MSG91 flow id>" }
     (SMS template variables {ORDER}, {AMOUNT}, {STATUS}.)
   Both channels are config-driven and NEVER block checkout — whichever is
   configured first wins; WhatsApp takes priority while both exist. */
export async function notifyOrderConfirmed(order, { paid = false } = {}) {
  const c = loadSmsConfig() || {};
  const phone = String(order?.customer?.phone || '').replace(/\D/g, '');
  const out = { event: 'order.notify', order: order?.id, paid, channel: 'none', result: 'skipped' };

  /* Channel 1: WhatsApp via MSG91 (no DLT needed). */
  const wa = c.whatsapp;
  if (wa && wa.enabled !== false && wa.templateName && wa.integratedNumber && phone) {
    const authkey = wa.authkey || c.authKey;
    if (authkey) {
      out.channel = 'whatsapp';
      try {
        const res = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authkey: String(authkey) },
          body: JSON.stringify({
            integrated_number: String(wa.integratedNumber),
            content_type: 'template',
            payload: {
              messaging_product: 'whatsapp',
              type: 'template',
              template: {
                name: String(wa.templateName),
                language: { code: String(wa.language || 'en'), policy: 'deterministic' },
                to_and_components: [{
                  to: ['91' + phone],
                  components: {
                    body_1: { type: 'text', value: String(order.id) },
                    body_2: { type: 'text', value: 'Rs.' + Math.round(Number(order.totalInr || 0)) },
                    body_3: { type: 'text', value: paid ? 'Paid online' : 'Cash on Delivery' }
                  }
                }]
              }
            }
          }),
          signal: AbortSignal.timeout(8000)
        });
        out.result = res.ok ? 'sent' : 'error-' + res.status;
        if (!res.ok) { try { out.body = (await res.text()).slice(0, 140); } catch {} }
      } catch (e) {
        out.result = 'error';
        out.error = String(e?.message || e).slice(0, 140);
      }
      console.log(JSON.stringify(out));
      return;
    }
  }

  /* Channel 2: SMS flow via MSG91 (requires your own DLT-approved template). */
  const flow = c.orderSms;
  if (flow && flow.flowId && c.authKey && phone) {
    out.channel = 'sms';
    try {
      const res = await fetch('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: String(c.authKey) },
        body: JSON.stringify({
          flow_id: String(flow.flowId),
          recipients: [{
            mobiles: '91' + phone,
            ORDER: order.id,
            AMOUNT: 'Rs.' + Math.round(Number(order.totalInr || 0)),
            STATUS: paid ? 'PAID' : 'COD'
          }]
        }),
        signal: AbortSignal.timeout(8000)
      });
      out.result = res.ok ? 'sent' : 'error-' + res.status;
    } catch (e) {
      out.result = 'error';
      out.error = String(e?.message || e).slice(0, 140);
    }
  }
  console.log(JSON.stringify(out));
}
