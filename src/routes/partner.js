import express from 'express';
import { readOrders, saveOrders, updateOrderStatus, awardLoyalty, awardReferral, loadSettings } from '../lib/store.js';
import { verifyPartnerToken, findPartnerByPhone, partnerToken, hashPin, publicPartner, recordPosition, partnerScore } from '../lib/partners.js';
import { statusChangedEmail, rewardCouponEmail } from '../lib/mailer.js';
import { planRoute } from '../lib/route.js';
import { whatsappLink, sendWhatsAppAuto } from '../lib/whatsapp.js';

export const router = express.Router();

/* --- simple brute-force guard for PIN sign-in --- */
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function registerAttempt(ip) {
  const now = Date.now();
  const row = loginAttempts.get(ip);
  if (!row || now > row.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return 1;
  }
  row.count += 1;
  return row.count;
}

function partnerOnly(req, res, next) {
  const partner = verifyPartnerToken(req.headers['x-partner-token']);
  if (!partner) return res.status(401).json({ ok: false, error: 'Session expired — please sign in again' });
  if (partner.active === false) return res.status(403).json({ ok: false, error: 'This partner account is disabled. Contact the shop.' });
  req.partner = partner;
  next();
}

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

router.post('/login', (req, res) => {
  try {
    const attempts = registerAttempt(req.ip || 'unknown');
    if (attempts > MAX_ATTEMPTS) {
      return res.status(429).json({ ok: false, error: 'Too many attempts — try again in 15 minutes.' });
    }
    const phone = String(req.body?.phone || '').trim();
    const pin = String(req.body?.pin || '').trim();
    if (!phone || !pin) return res.status(400).json({ ok: false, error: 'Enter your mobile number and PIN' });
    const partner = findPartnerByPhone(phone);
    if (!partner || partner.active === false || partner.pinHash !== hashPin(pin, partner.phone)) {
      return res.status(401).json({ ok: false, error: 'Wrong mobile number or PIN' });
    }
    res.json({ ok: true, token: partnerToken(partner), partner: publicPartner(partner) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Sign-in failed' });
  }
});

router.get('/session', partnerOnly, (req, res) => {
  const delivery = loadSettings().delivery || {};
  res.json({ ok: true, partner: publicPartner(req.partner), hub: { lat: delivery.hubLat ?? null, lng: delivery.hubLng ?? null } });
});

/* Tiny version stamp — the app polls this (10s) and only reloads orders when it changes */
router.get('/version', partnerOnly, (req, res) => {
  const mine = readOrders().filter(o => o.assignedPartnerId === req.partner.id);
  const active = mine.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
  const newest = mine.reduce((max, o) => (String(o.updatedAt || '') > max ? String(o.updatedAt || '') : max), '');
  res.json({ ok: true, v: `${mine.length}:${active.length}:${newest}` });
});

/* Orders assigned to this partner: active work first, then today's completed */
router.get('/orders', partnerOnly, (req, res) => {
  const mine = readOrders()
    .filter(o => o.assignedPartnerId === req.partner.id)
    .sort((a, b) => String(a.slot?.startHour ?? 0) - String(b.slot?.startHour ?? 0) || String(a.placedAt).localeCompare(String(b.placedAt)));
  const active = mine.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
  const doneToday = mine.filter(o => o.status === 'DELIVERED' && String(o.updatedAt || '').startsWith(todayIST()));
  const collected = mine.filter(o => o.status === 'OUT_FOR_DELIVERY').length;
  res.json({ ok: true, active, doneToday, stats: { active: active.length, collected, deliveredToday: doneToday.length } });
});

/* Partner status flow: collect from shop -> OUT_FOR_DELIVERY, hand over -> DELIVERED */
router.patch('/orders/:id/status', partnerOnly, (req, res) => {
  try {
    const mine = readOrders();
    const order = mine.find(o => o.id === req.params.id && o.assignedPartnerId === req.partner.id);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not assigned to you' });
    const status = String(req.body?.status || '').toUpperCase();
    if (!['OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'You can only mark collected or delivered' });
    }
    if (status === 'OUT_FOR_DELIVERY' && !['CONFIRMED', 'PACKING', 'PLACED'].includes(order.status)) {
      return res.status(409).json({ ok: false, error: `Order is currently ${order.status.replaceAll('_', ' ').toLowerCase()} — cannot collect yet` });
    }
    if (status === 'DELIVERED' && order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(409).json({ ok: false, error: 'Mark the order as collected before delivering it' });
    }
    const note = String(req.body?.note || '').slice(0, 200) ||
      (status === 'DELIVERED' ? `Delivered by ${req.partner.name}` : `Collected from shop by ${req.partner.name}`);
    const updated = updateOrderStatus(order.id, status, note);
    let rewards = null;
    if (status === 'DELIVERED') {
      const loyaltyCoupon = awardLoyalty(updated);
      const referral = awardReferral(updated);
      rewards = { loyaltyCoupon, referral };
      if (loyaltyCoupon) rewardCouponEmail(updated, loyaltyCoupon, 'Your loyalty reward is here! \u{1F381}');
      if (referral) rewardCouponEmail(updated, referral.friendCoupon, 'Referral thank-you! \u{1F381}');
    }
    statusChangedEmail(updated);
    // WhatsApp update: one-tap link back to the partner + auto-send if provider configured
    const wa = whatsappLink(updated, status, { partner: req.partner.name });
    if (wa) sendWhatsAppAuto(status, updated, { partner: req.partner.name });
    res.json({ ok: true, order: updated, rewards, whatsapp: wa });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not update the order' });
  }
});

/* Report a problem (gate closed, customer not picking up, wrong pin…) — keeps order state, flags for owner */
router.post('/orders/:id/problem', partnerOnly, (req, res) => {
  try {
    const mine = readOrders();
    const order = mine.find(o => o.id === req.params.id && o.assignedPartnerId === req.partner.id);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not assigned to you' });
    const note = String(req.body?.note || '').trim().slice(0, 300);
    if (note.length < 3) return res.status(400).json({ ok: false, error: 'Write a short note about what happened' });
    order.history.push({ status: order.status, at: new Date().toISOString(), note: `⚠️ Partner ${req.partner.name}: ${note}` });
    order.updatedAt = new Date().toISOString();
    saveOrders(mine);
    res.json({ ok: true, order });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not report the problem' });
  }
});

/* Live GPS position from the partner app (called every ~10s while tracking is ON) */
router.post('/position', partnerOnly, (req, res) => {
  try {
    const position = recordPosition(req.partner.id, req.body || {});
    res.json({ ok: true, position });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Invalid position' });
  }
});

/* 🧭 Smart route: auto-sorts today's stops into the shortest morning route */
router.get('/route', partnerOnly, async (req, res) => {
  try {
    const mine = readOrders().filter(o => o.assignedPartnerId === req.partner.id);
    const active = mine.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status) && o.location && Number.isFinite(Number(o.location.lat)));
    if (!active.length) return res.json({ ok: true, route: { ordered: [], totalKm: 0, mapsUrl: null, stops: 0 } });
    const delivery = loadSettings().delivery || {};
    const hub = { lat: Number(delivery.hubLat), lng: Number(delivery.hubLng) };
    const slotId = String(req.query.slot || '');
    const stops = (slotId ? active.filter(o => o.slot?.id === slotId) : active).map(order => ({
      order: {
        id: order.id,
        customer: order.customer,
        address: order.address,
        slot: order.slot,
        totalInr: order.totalInr,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        items: order.items,
        status: order.status
      },
      location: order.location
    }));
    const startHour = Number(stops[0]?.order?.slot?.startHour) >= 0 ? Number(stops[0].order.slot.startHour) : 7;
    const route = await planRoute({ hub, stops, startHour });
    const ordered = route.ordered.map(entry => ({
      ...entry.stop.order,
      stopNumber: entry.stopNumber,
      legKm: entry.legKm,
      cumulativeKm: entry.cumulativeKm,
      etaClock: entry.etaClock
    }));
    res.json({ ok: true, route: { ordered, totalKm: route.totalKm, provider: route.provider, mapsUrl: route.mapsUrl, stops: ordered.length } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Could not plan the route' });
  }
});

/* 📈 Own scorecard: deliveries + average time per delivery */
router.get('/stats', partnerOnly, (req, res) => {
  const score = partnerScore(readOrders(), req.partner.id);
  res.json({ ok: true, stats: score });
});
