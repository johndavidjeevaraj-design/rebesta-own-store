/* Rebesta Fresh — morning digest email 📊
   One email at 09:00 IST every day with yesterday's orders + revenue,
   today's delivery plan, subscription count, low stock and COD cash pending.
   State: data/digest-state.json keeps lastSentFor so restarts never double-send. */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { readOrders, loadProducts, loadSubscriptions, loadSettings, istDay, cashSummary } from './store.js';
import { sendMail, mailerReady, notifyAddress } from './mailer.js';

const IST_MIN = 5 * 60 + 30;
const money = inr => `₹${Number(inr || 0).toLocaleString('en-IN')}`;

function istNow(now = new Date()) {
  return new Date(now.getTime() + IST_MIN * 60000);
}
function istTodayIso(now = new Date()) {
  return istNow(now).toISOString().slice(0, 10);
}
function istDaysAgoIso(now = new Date(), days = 1) {
  const s = istNow(now);
  s.setUTCDate(s.getUTCDate() - days);
  return s.toISOString().slice(0, 10);
}

const stateFile = path.join(config.dataDir, 'digest-state.json');
function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; }
}
function writeState(state) {
  const temp = `${stateFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, stateFile);
}

/* Pure builder — reads live data, returns everything the email needs. */
export function buildMorningDigest(now = new Date()) {
  const todayIso = istTodayIso(now);
  const yesterdayIso = istDaysAgoIso(now, 1);

  const orders = readOrders();
  const placedYesterday = orders.filter(o => istDay(o.placedAt) === yesterdayIso);
  const revenueYesterday = placedYesterday.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + Number(o.totalInr || 0), 0);
  const codYesterday = placedYesterday.filter(o => o.paymentMethod === 'cod').length;
  const deliveredYesterday = orders.filter(o => o.status === 'DELIVERED' && o.deliveryDate?.iso === yesterdayIso);

  const todayOrders = orders.filter(o => o.deliveryDate?.iso === todayIso && !['DELIVERED', 'CANCELLED'].includes(o.status));
  const bySlot = {};
  for (const o of todayOrders) {
    const label = o.slot?.label || o.slot?.id || 'slot TBD';
    bySlot[label] = (bySlot[label] || 0) + 1;
  }
  const todayValue = todayOrders.reduce((s, o) => s + Number(o.totalInr || 0), 0);

  const subs = loadSubscriptions();
  const activeSubs = subs.filter(s => s.status === 'ACTIVE');
  const subsDueToday = activeSubs.filter(s => s.nextRunOn === todayIso);

  const lowStock = loadProducts().filter(p => p.active && Number(p.stock) <= 10).sort((a, b) => Number(a.stock) - Number(b.stock));
  const cash = cashSummary(yesterdayIso).totals || {};

  const dayLabel = new Date(todayIso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  const stats = {
    todayIso, yesterdayIso,
    ordersYesterday: placedYesterday.length,
    revenueYesterday,
    codYesterday,
    onlineYesterday: placedYesterday.length - codYesterday,
    deliveredYesterday: deliveredYesterday.length,
    todayOrders: todayOrders.length,
    todayValue,
    bySlot,
    activeSubs: activeSubs.length,
    subsDueToday: subsDueToday.length,
    lowStockCount: lowStock.length,
    lowStockTop: lowStock.slice(0, 6).map(p => ({ title: p.title, stock: p.stock })),
    cashPending: Number(cash.pendingInr || 0)
  };

  const subject = `🥬 Morning digest — ${stats.ordersYesterday} order${stats.ordersYesterday === 1 ? '' : 's'} yesterday · ${money(stats.revenueYesterday)} · ${stats.todayOrders} to deliver today`;
  const title = `Good morning! Yesterday & today — ${dayLabel}`;

  const row = (label, value, strong = false) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid #eef2ea;color:#8b988f;font-size:13px">${label}</td><td style="padding:7px 0;border-bottom:1px solid #eef2ea;font-size:13px;font-weight:${strong ? 800 : 600};text-align:right;white-space:nowrap;color:${strong ? '#0d8736' : '#333'}">${value}</td></tr>`;

  const slotRows = Object.entries(bySlot).map(([label, count]) => row(`&nbsp;&nbsp;· ${label}`, `${count} order${count === 1 ? '' : 's'}`)).join('');
  const lowStockRows = stats.lowStockTop.map(p => row(p.title, `only ${p.stock} left`)).join('');

  const bodyHtml = `
    <p style="margin:0 0 14px;color:#333;font-size:13px">Here's your shop at a glance for <strong>${dayLabel}</strong>.</p>

    <h3 style="margin:16px 0 6px;color:#17251b;font-size:14px">📊 Yesterday (${stats.yesterdayIso})</h3>
    <table role="presentation" width="100%" style="border-collapse:collapse">
      ${row('Orders placed', stats.ordersYesterday, true)}
      ${row('Revenue', money(stats.revenueYesterday), true)}
      ${row('COD vs online', `${stats.codYesterday} COD · ${stats.onlineYesterday} online`)}
      ${row('Delivered', stats.deliveredYesterday)}
      ${stats.cashPending > 0 ? row('COD cash pending from riders', `<span style="color:#c2610a">${money(stats.cashPending)}</span>`) : ''}
    </table>

    <h3 style="margin:16px 0 6px;color:#17251b;font-size:14px">🛵 Today's delivery plan</h3>
    <table role="presentation" width="100%" style="border-collapse:collapse">
      ${row('Orders to deliver', stats.todayOrders, true)}
      ${row('Order value', money(stats.todayValue))}
      ${slotRows}
      ${stats.subsDueToday > 0 ? row('Subscription boxes due', stats.subsDueToday) : ''}
    </table>

    ${stats.lowStockCount > 0 ? `
    <h3 style="margin:16px 0 6px;color:#17251b;font-size:14px">⚠️ Low stock (${stats.lowStockCount})</h3>
    <table role="presentation" width="100%" style="border-collapse:collapse">${lowStockRows}</table>` : ''}

    <p style="margin:16px 0 0;color:#8b988f;font-size:12px">🔁 Active weekly subscriptions: <strong style="color:#333">${stats.activeSubs}</strong></p>
    <p style="margin:10px 0 0"><a href="${config.appUrl}/admin" style="display:inline-block;background:#0d8736;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:9px">Open admin dashboard</a></p>`;

  return { subject, title, bodyHtml, stats };
}

/* Sends the digest to the owner (notify address). force=true ignores the
   once-per-day guard — used by the admin "send test" endpoint. */
export async function sendMorningDigest({ force = false } = {}) {
  if (!mailerReady()) return { ok: false, reason: 'smtp_not_configured' };
  const todayIso = istTodayIso();
  const state = readState();
  if (!force && state.lastSentFor === todayIso) return { ok: true, skipped: true };

  const digest = buildMorningDigest(new Date());
  const sent = await sendMail({ to: notifyAddress(), subject: digest.subject, title: digest.title, bodyHtml: digest.bodyHtml });
  if (sent) {
    writeState({ ...(state || {}), lastSentFor: todayIso, lastSentAt: new Date().toISOString() });
    console.log(JSON.stringify({ event: 'digest.sent', for: todayIso, stats: { orders: digest.stats.ordersYesterday, revenue: digest.stats.revenueYesterday } }));
  }
  return { ok: sent, stats: digest.stats };
}

/* Tick every 10 minutes; send once per day inside the 09:00–09:59 IST window. */
export function startDigestScheduler() {
  const tick = async () => {
    try {
      if (istNow().getUTCHours() !== 9) return;
      if (readState().lastSentFor === istTodayIso()) return;
      await sendMorningDigest();
    } catch (error) {
      console.error(JSON.stringify({ event: 'digest.error', error: String(error?.message || error).slice(0, 200) }));
    }
  };
  setTimeout(tick, 45_000).unref?.();
  setInterval(tick, 10 * 60 * 1000).unref?.();
}
