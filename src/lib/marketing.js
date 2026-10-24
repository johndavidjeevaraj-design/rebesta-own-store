/* Customer marketing preferences and the daily WhatsApp campaign scheduler.
   Consent is opt-in only; campaign delivery is disabled until Admin explicitly
   enables it and a provider/template, message, and IST send time are configured. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { loadSettings } from './store.js';
import { getMarketingWhatsAppConfigStatus, sendMarketingWhatsAppTemplate } from '../sms.js';

const CONTACTS_FILE = path.join(config.dataDir, 'marketing-contacts.json');
const CONSENT_VERSION = 'whatsapp-daily-marketing-v1';
const MAX_DAILY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000;
export const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/rebestafresh?xtok=MWNtb3N2ZjA3am42cA==';

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

export function normalizeMarketingPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(phone) ? phone : '';
}

export function normalizeInstagramUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const handle = raw.replace(/^@/, '');
  if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) return `https://www.instagram.com/${handle}/`;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
  if (!match) return null;
  // Keep the supplied profile query string (including Instagram's xtok token).
  // Fragments are omitted because they are not part of the profile URL.
  const trailingSlash = url.pathname.endsWith('/') || !url.search;
  return `https://www.instagram.com/${match[1]}${trailingSlash ? '/' : ''}${url.search}`;
}

export function getMarketingSettings() {
  const raw = loadSettings().marketing || {};
  const whatsapp = raw.whatsapp || {};
  const instagramUrl = Object.prototype.hasOwnProperty.call(raw, 'instagramUrl')
    ? normalizeInstagramUrl(raw.instagramUrl)
    : DEFAULT_INSTAGRAM_URL;
  return {
    instagramUrl: instagramUrl || '',
    whatsapp: {
      collectOptIns: whatsapp.collectOptIns !== false,
      enabled: whatsapp.enabled === true,
      sendTimeIst: String(whatsapp.sendTimeIst || ''),
      messageTemplate: String(whatsapp.messageTemplate || '')
    }
  };
}

export function getPublicMarketingSettings() {
  const settings = getMarketingSettings();
  return {
    instagramUrl: settings.instagramUrl,
    whatsappOptInEnabled: settings.whatsapp.collectOptIns
  };
}

export function getMarketingContacts() {
  const contacts = readJson(CONTACTS_FILE, []);
  return Array.isArray(contacts) ? contacts : [];
}

export function getMarketingContact(phone) {
  const normalized = normalizeMarketingPhone(phone);
  if (!normalized) return null;
  return getMarketingContacts().find(contact => contact.phone === normalized) || null;
}

export function isMarketingOptedIn(phone) {
  return getMarketingContact(phone)?.active === true;
}

function validMarketingOrder(order) {
  if (!order || order.status === 'CANCELLED') return false;
  const method = String(order.paymentMethod || '').toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').toUpperCase();
  if (method === 'online') return ['PAID', 'PAID_ONLINE'].includes(paymentStatus);
  return method === 'cod' && !['PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED'].includes(String(order.status || '').toUpperCase());
}

export function subscribeMarketingContact(phone, { source = 'delivered-track', orderId = '' } = {}) {
  const normalized = normalizeMarketingPhone(phone);
  if (!normalized) throw Object.assign(new Error('Enter a valid mobile number'), { status: 400 });
  const contacts = getMarketingContacts();
  const now = new Date().toISOString();
  let contact = contacts.find(item => item.phone === normalized);
  if (!contact) {
    contact = {
      id: crypto.randomBytes(16).toString('hex'),
      phone: normalized,
      active: false,
      consentHistory: [],
      createdAt: now
    };
    contacts.push(contact);
  }
  contact.active = true;
  contact.consentAt = now;
  contact.consentSource = String(source || 'delivered-track').slice(0, 40);
  contact.consentVersion = CONSENT_VERSION;
  contact.orderId = String(orderId || '').trim().toUpperCase().slice(0, 40);
  contact.updatedAt = now;
  contact.consentHistory = Array.isArray(contact.consentHistory) ? contact.consentHistory : [];
  contact.consentHistory.push({ action: 'opt-in', at: now, source: contact.consentSource, orderId: contact.orderId, version: CONSENT_VERSION });
  contact.consentHistory = contact.consentHistory.slice(-30);
  writeJson(CONTACTS_FILE, contacts);
  return { active: true, consentAt: now };
}

export function subscribeFromConfirmedOrder(order) {
  if (order?.marketingWhatsAppOptIn !== true || !validMarketingOrder(order)) return false;
  const phone = normalizeMarketingPhone(order.customer?.phone);
  if (!phone) return false;
  subscribeMarketingContact(phone, { source: 'checkout', orderId: order.id });
  return true;
}

export function unsubscribeMarketingContact(phone, { source = 'delivered-track' } = {}) {
  const normalized = normalizeMarketingPhone(phone);
  if (!normalized) return false;
  const contacts = getMarketingContacts();
  const contact = contacts.find(item => item.phone === normalized);
  if (!contact || contact.active !== true) return false;
  const now = new Date().toISOString();
  contact.active = false;
  contact.unsubscribedAt = now;
  contact.updatedAt = now;
  contact.consentHistory = Array.isArray(contact.consentHistory) ? contact.consentHistory : [];
  contact.consentHistory.push({ action: 'opt-out', at: now, source: String(source || 'delivered-track').slice(0, 40), version: CONSENT_VERSION });
  contact.consentHistory = contact.consentHistory.slice(-30);
  writeJson(CONTACTS_FILE, contacts);
  return true;
}

function tokenSignature(payload) {
  return crypto.createHmac('sha256', String(config.adminKey)).update(payload).digest();
}

export function createMarketingUnsubscribeToken(contactId) {
  const payload = Buffer.from(JSON.stringify({ id: String(contactId), purpose: 'marketing-opt-out' })).toString('base64url');
  const signature = tokenSignature(payload).toString('base64url');
  return `${payload}.${signature}`;
}

function contactIdFromUnsubscribeToken(token) {
  try {
    const raw = String(token || '');
    if (!raw || raw.length > 2048) return '';
    const [payload, suppliedSignature, extra] = raw.split('.');
    if (!payload || !suppliedSignature || extra !== undefined) return '';
    const expected = tokenSignature(payload);
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return '';
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded?.purpose === 'marketing-opt-out' && /^[a-f0-9]{32}$/.test(decoded.id) ? decoded.id : '';
  } catch { return ''; }
}

export function unsubscribeMarketingToken(token) {
  const id = contactIdFromUnsubscribeToken(token);
  if (!id) return { ok: false, reason: 'invalid-token' };
  const contacts = getMarketingContacts();
  const contact = contacts.find(item => item.id === id);
  if (!contact) return { ok: false, reason: 'not-found' };
  if (contact.active === true) {
    const now = new Date().toISOString();
    contact.active = false;
    contact.unsubscribedAt = now;
    contact.updatedAt = now;
    contact.consentHistory = Array.isArray(contact.consentHistory) ? contact.consentHistory : [];
    contact.consentHistory.push({ action: 'opt-out', at: now, source: 'whatsapp-unsubscribe-link', version: CONSENT_VERSION });
    contact.consentHistory = contact.consentHistory.slice(-30);
    writeJson(CONTACTS_FILE, contacts);
  }
  return { ok: true, alreadyUnsubscribed: contact.active !== true };
}

export function marketingUnsubscribeUrl(contactId) {
  const token = createMarketingUnsubscribeToken(contactId);
  return `${config.appUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function getMarketingProviderStatus() {
  return getMarketingWhatsAppConfigStatus();
}

export function getMarketingAdminSummary() {
  const contacts = getMarketingContacts();
  const active = contacts.filter(contact => contact.active === true);
  return {
    optedIn: active.length,
    optedOut: contacts.length - active.length,
    lastSentAt: active.reduce((latest, contact) => !latest || String(contact.lastSentAt || '') > latest ? String(contact.lastSentAt || '') : latest, '') || ''
  };
}

function istDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function istClock(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export async function runDailyMarketingSweep({ now = new Date(), force = false, sendFn = sendMarketingWhatsAppTemplate } = {}) {
  const settings = getMarketingSettings().whatsapp;
  if (!settings.enabled) return { attempted: 0, sent: 0, failed: 0, skipped: 'paused' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.sendTimeIst)) return { attempted: 0, sent: 0, failed: 0, skipped: 'send-time-not-set' };
  if (!settings.messageTemplate.trim()) return { attempted: 0, sent: 0, failed: 0, skipped: 'message-not-set' };
  const provider = getMarketingProviderStatus();
  if (!provider.configured) return { attempted: 0, sent: 0, failed: 0, skipped: 'provider-not-configured' };
  const today = istDay(now);
  if (!force && istClock(now) < settings.sendTimeIst) return { attempted: 0, sent: 0, failed: 0, skipped: 'not-due' };

  let contacts = getMarketingContacts();
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < contacts.length; index++) {
    let contact = contacts[index];
    if (contact.active !== true || contact.lastSentFor === today) continue;
    const attempts = contact.attemptDate === today ? Number(contact.attemptCount || 0) : 0;
    if (attempts >= MAX_DAILY_ATTEMPTS) continue;
    if (attempts && now.getTime() - new Date(contact.lastAttemptAt || 0).getTime() < RETRY_DELAY_MS) continue;

    contact.attemptDate = today;
    contact.attemptCount = attempts + 1;
    contact.lastAttemptAt = now.toISOString();
    contacts[index] = contact;
    writeJson(CONTACTS_FILE, contacts);
    attempted++;

    let result;
    try {
      result = await sendFn(
        contact.phone,
        settings.messageTemplate.trim(),
        marketingUnsubscribeUrl(contact.id)
      );
    } catch (error) {
      result = { ok: false, error: String(error?.message || error) };
    }
    contacts = getMarketingContacts();
    contact = contacts.find(item => item.id === contact.id) || contact;
    if (result?.ok === true || result?.sent === true) {
      contact.lastSentFor = today;
      contact.lastSentAt = now.toISOString();
      delete contact.lastError;
      sent++;
    } else {
      contact.lastError = String(result?.error || result?.reason || 'send-failed').slice(0, 200);
      failed++;
    }
    const currentIndex = contacts.findIndex(item => item.id === contact.id);
    if (currentIndex >= 0) contacts[currentIndex] = contact;
    writeJson(CONTACTS_FILE, contacts);
  }
  return { attempted, sent, failed, skipped: '' };
}

let schedulerRunning = false;
export function startMarketingScheduler() {
  const tick = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const result = await runDailyMarketingSweep();
      if (result.attempted || result.failed) {
        console.log(JSON.stringify({ event: 'marketing.whatsapp.daily', attempted: result.attempted, sent: result.sent, failed: result.failed, day: istDay(new Date()) }));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'marketing.whatsapp.error', error: String(error?.message || error).slice(0, 200) }));
    } finally {
      schedulerRunning = false;
    }
  };
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, 60_000).unref?.();
}
