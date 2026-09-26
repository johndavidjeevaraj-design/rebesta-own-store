/* Rebesta Fresh — weekly subscriptions 🔁
   "Family Veg Basket every Monday" — recurring revenue with COD simplicity:
   the day before each scheduled delivery (06:00 IST) the system auto-creates a
   normal order from the subscription (current prices + stock), which then flows
   through the usual confirm → pack → assign → deliver pipeline. */
import crypto from 'node:crypto';
import { loadSubscriptions, saveSubscriptions, buildCart, addOrder, loadSettings } from './store.js';
import { haversineKm, feeForQuote } from './delivery.js';
import { orderPlacedEmails } from './mailer.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IST_OFFSET_MIN = 5 * 60 + 30;

function istParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

export function istTodayIso(date = new Date()) {
  const p = istParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function istMidnightUtc(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MIN * 60000;
}

function isoFromIst(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function weekdayLabel(weekday) {
  return WEEKDAYS[Math.round(Number(weekday))] || '';
}

function deliveryDateLabel(isoDate) {
  const t = istMidnightUtc(isoDate);
  const p = istParts(new Date(t));
  return { iso: isoFromIst(p.y, p.m, p.d), label: `${WEEKDAYS[p.weekday]}, ${String(p.d).padStart(2, '0')}-${String(p.m).padStart(2, '0')}-${p.y}` };
}

/* Next date (strictly after fromIso) that falls on the given weekday (0=Sun) */
export function nextDateAfter(fromIso, weekday) {
  let t = istMidnightUtc(fromIso) + 86400000;
  for (let guard = 0; guard < 10; guard++) {
    const p = istParts(new Date(t));
    if (p.weekday === Math.round(Number(weekday))) return isoFromIst(p.y, p.m, p.d);
    t += 86400000;
  }
  return fromIso;
}

export function createSubscriptionFromOrder(order, { weekday }) {
  const day = Math.round(Number(weekday));
  if (!Number.isInteger(day) || day < 0 || day > 6) throw Object.assign(new Error('Choose a delivery weekday'), { status: 400 });
  const phone = String(order.customer?.phone || '').replace(/\D/g, '');
  if (phone.slice(-10).length !== 10) throw Object.assign(new Error('Order has no valid phone number'), { status: 400 });
  if (!order.location || !Number.isFinite(Number(order.location.lat))) throw Object.assign(new Error('Order has no map pin — cannot schedule repeats'), { status: 400 });
  if (!Array.isArray(order.items) || !order.items.length) throw Object.assign(new Error('Order has no items'), { status: 400 });

  const existing = loadSubscriptions();
  if (existing.some(s => s.orderId === order.id)) {
    throw Object.assign(new Error('This order is already a weekly subscription'), { status: 409 });
  }

  const anchorIso = String(order.deliveryDate?.iso || istTodayIso());
  const subscription = {
    id: `SUB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    orderId: order.id,
    status: 'ACTIVE',
    name: String(order.customer?.name || '').trim().slice(0, 80),
    phone,
    email: order.customer?.email || '',
    weekday: day,
    weekdayLabel: weekdayLabel(day),
    items: order.items.map(i => ({ handle: i.handle, qty: Number(i.qty) || 1 })),
    slotId: order.slot?.id || '',
    address: order.address,
    location: order.location,
    paymentMethod: 'cod',
    nextRunOn: nextDateAfter(anchorIso, day),
    lastRunFor: '',
    lastOrderId: '',
    createdAt: new Date().toISOString(),
    source: 'web'
  };
  existing.unshift(subscription);
  saveSubscriptions(existing);
  return subscription;
}

export function publicSubscription(sub) {
  return {
    id: sub.id,
    status: sub.status,
    name: sub.name,
    weekday: sub.weekday,
    weekdayLabel: sub.weekdayLabel || weekdayLabel(sub.weekday),
    nextRunOn: sub.nextRunOn,
    itemCount: (sub.items || []).reduce((s, i) => s + Number(i.qty || 0), 0),
    items: sub.items || [],
    slotId: sub.slotId,
    address: { line1: sub.address?.line1 || '', area: sub.address?.area || '', city: sub.address?.city || '' },
    lastOrderId: sub.lastOrderId || '',
    pauseReason: sub.pauseReason || '',
    createdAt: sub.createdAt
  };
}

function buildSubscriptionOrder(sub) {
  const cart = buildCart((sub.items || []).map(i => ({ handle: i.handle, qty: i.qty })));
  const delivery = loadSettings().delivery || {};
  const hub = { lat: Number(delivery.hubLat), lng: Number(delivery.hubLng) };
  const distanceKm = Math.round(haversineKm(hub, sub.location) * 1.25 * 100) / 100;
  const fee = feeForQuote(distanceKm, cart.subtotalInr, delivery);
  const slotDef = (delivery.slots || []).find(s => s.id === sub.slotId) || (delivery.slots || [])[0] || { id: 'am1', label: '7:00 AM – 9:00 AM', startHour: 7, endHour: 9 };
  const date = deliveryDateLabel(sub.nextRunOn);
  const total = Math.round((cart.subtotalInr + fee.deliveryFeeInr) * 100) / 100;
  return addOrder({
    customer: { name: sub.name, phone: sub.phone, email: sub.email || '' },
    address: sub.address,
    items: cart.lines,
    subtotalInr: cart.subtotalInr,
    discountInr: 0,
    couponCode: '',
    deliveryFeeInr: fee.deliveryFeeInr,
    totalInr: total,
    distanceKm,
    deliveryTierLabel: fee.tier?.label || '',
    freeDeliveryApplied: Boolean(fee.freeApplied),
    deliveryDate: date,
    slot: { id: slotDef.id, label: slotDef.label, startHour: slotDef.startHour, endHour: slotDef.endHour, date: date.iso, dateLabel: date.label },
    location: sub.location,
    paymentMethod: 'cod',
    referredBy: '',
    notes: '🔁 Weekly subscription order (auto-created)',
    source: `subscription:${sub.id}`
  });
}

/* Sweep: creates due subscription orders. Safe to run any time — idempotent
   per (subscription, nextRunOn) via lastRunFor. Called at boot + every 15 min. */
export function runSubscriptionSweep(now = new Date()) {
  const subscriptions = loadSubscriptions();
  let created = 0;
  const issues = [];
  let changed = false;

  for (const sub of subscriptions) {
    if (sub.status !== 'ACTIVE') continue;
    if (!sub.nextRunOn) continue;
    const dueAt = istMidnightUtc(sub.nextRunOn) - 86400000 + 6 * 3600000; // 06:00 IST, day before delivery
    if (now.getTime() < dueAt || sub.lastRunFor === sub.nextRunOn) continue;

    try {
      const order = buildSubscriptionOrder(sub);
      sub.lastRunFor = sub.nextRunOn;
      sub.lastOrderId = order.id;
      sub.lastOrderAt = now.toISOString();
      sub.nextRunOn = nextDateAfter(sub.nextRunOn, sub.weekday);
      sub.pauseReason = '';
      changed = true;
      created++;
      console.log(JSON.stringify({ event: 'subscription.order_created', subscription: sub.id, order: order.id, deliverOn: order.deliveryDate.iso }));
      orderPlacedEmails(order);
    } catch (error) {
      // Usually a stock/price problem — pause so the owner sees it, keep the date
      sub.status = 'PAUSED';
      sub.pauseReason = `Auto-order failed: ${String(error?.message || error).slice(0, 160)}`;
      changed = true;
      issues.push({ id: sub.id, reason: sub.pauseReason });
      console.error(JSON.stringify({ event: 'subscription.failed', subscription: sub.id, error: sub.pauseReason }));
    }
  }

  if (changed) saveSubscriptions(subscriptions);
  return { created, issues };
}

export function startSubscriptionScheduler() {
  const tick = () => {
    try {
      const result = runSubscriptionSweep();
      if (result.created || result.issues.length) {
        console.log(JSON.stringify({ event: 'subscription.sweep', created: result.created, issues: result.issues.length }));
      }
    } catch (error) {
      console.error(JSON.stringify({ event: 'subscription.sweep.error', error: String(error?.message || error).slice(0, 200) }));
    }
  };
  setTimeout(tick, 20_000).unref?.();
  setInterval(tick, 15 * 60 * 1000).unref?.();
}
