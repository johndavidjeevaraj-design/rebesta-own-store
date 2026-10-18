import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadSettings, getOrder } from './store.js';

/* ============ 💬 Customer support assistant ============
   The chat widget on the storefront posts here. Two modes:
   - AI mode: Google Gemini answers using live store facts (settings) —
     needs a FREE API key from aistudio.google.com pasted in Admin settings.
   - Basic mode (no key): keyword answers + WhatsApp handoff — always works.
   Either way, order questions are answered from REAL order data: the
   customer's order ID + phone number are looked up before answering. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const QUERIES_FILE = path.join(dataDir, 'support-queries.json');

const STATUS_FRIENDLY = {
  PENDING_PAYMENT: 'waiting for payment',
  PLACED: 'received and queued',
  CONFIRMED: 'confirmed by the shop',
  PACKING: 'being packed right now',
  OUT_FOR_DELIVERY: 'out for delivery 🛵',
  DELIVERED: 'delivered 🎉',
  CANCELLED: 'cancelled',
  PAYMENT_FAILED: 'payment failed (no money was taken twice — any duplicate charge is auto-refunded)',
  PAID_NEEDS_REVIEW: 'payment is being verified by the shop'
};

export function normalizePhoneSupport(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? `91${last10}` : '';
}

export function readSupportQueries() {
  try {
    const v = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function logSupportQuery({ message = '', phone = '', source = 'chat' } = {}) {
  try {
    const all = readSupportQueries();
    all.unshift({
      at: new Date().toISOString(),
      message: String(message).slice(0, 500),
      phone: String(phone).slice(0, 15),
      source: String(source).slice(0, 20)
    });
    while (all.length > 200) all.pop();
    fs.writeFileSync(QUERIES_FILE, JSON.stringify(all, null, 2));
    return true;
  } catch (error) {
    console.error(JSON.stringify({ event: 'support.query.log.error', error: String(error?.message || error).slice(0, 120) }));
    return false;
  }
}

export function supportConfig() {
  const s = loadSettings();
  const sup = s.support || {};
  return {
    enabled: sup.enabled !== false,
    aiKey: String(sup.aiKey || ''),
    model: String(sup.model || 'gemini-2.0-flash').slice(0, 40)
  };
}

/* live facts about the shop — rebuilt on every request so fee/slot changes
   in the admin panel are reflected in answers immediately */
function knowledgeText() {
  const s = loadSettings();
  const b = s.business || {};
  const d = s.delivery || {};
  const slots = (d.slots || []).map(x => x.label).join(' or ');
  const tiers = (d.tiers || []).map(t => `${t.label} → ₹${t.feeInr}`).join(', ');
  const online = Boolean((s.payments?.onlineEnabled ?? s.payments?.payuEnabled));
  return `
SHOP FACTS (use these, never invent numbers):
- Shop: ${b.name || 'Rebesta Fresh'}, ${b.city || 'Hosur'} (Tamil Nadu). Phone ${b.phoneDisplay || ''}. FSSAI ${b.fssai || '—'}.
- Delivery: morning slots ${slots || '7–9 AM / 9–11 AM'}, to homes in and around ${b.city || 'Hosur'}.
- Delivery fee by road distance: ${tiers || '₹20–₹100'}. FREE delivery on baskets over ₹${d.freeOverInr || 500}. We deliver up to ~${d.maxRoadKm || 9} km road distance from the shop.
- Payment: Cash on Delivery${online ? ' and online UPI/cards' : ''}.
- Freshness promise: if it is not fresh, it is free. Report issues on delivery or right after via WhatsApp.
- Cancellation: free before packing starts (before ~6 AM on delivery day) from the Track page; after that, WhatsApp us.
- Refunds: for online payments, refunded to the original payment method (usually 3–5 working days after we process it).
- Track an order: Track page (order ID + the mobile number used at checkout).
- Coupons: apply at checkout; loyalty coupon LOY-… arrives by email after a delivered order; referral REF-… for both sides.`;
}

const SYSTEM_PROMPT = `You are the friendly Rebesta Fresh shop assistant (a small vegetable delivery shop in Hosur, Tamil Nadu, India).
Rules:
- Reply in 1-4 short sentences, warm and simple English (many customers are shopping quickly on a phone). You may use Hindi/Tamil words if the customer does.
- Use ONLY the facts provided below. Never invent prices, policies or promises. If you don't know, say so and point the customer to the WhatsApp button in the chat to talk to the shop.
- Order questions: ask for the order ID (looks like RB-20260922-A3F9K2) AND the mobile number used at checkout. When an [ORDER LOOKUP] block is provided below, use it as truth. If the phone is not verified, share only the order status — never the address or full phone number.
- For complaints, damaged/missing items, refunds, or anything you cannot resolve: apologise briefly and tell the customer to tap the WhatsApp button below — the shop owner will help personally. Do not promise refunds yourself.
- Keep it about shopping: vegetables, orders, delivery, payments, coupons. Refuse anything else politely.`;

/* if the customer's message contains an order ID, look up the real order now */
function orderContext(message) {
  const text = String(message || '');
  const idMatch = text.toUpperCase().match(/\bRB-\d{8}-[A-F0-9]{4,8}\b/);
  if (!idMatch) return '';
  const order = getOrder(idMatch[0]);
  if (!order) {
    return `\n[ORDER LOOKUP] ${idMatch[0]}: NOT FOUND. Politely say you cannot find this order ID and ask them to check it (from the confirmation email or the Track page).`;
  }
  const phone = normalizePhoneSupport(text);
  const verified = Boolean(phone && order.customer?.phone === phone);
  const items = (order.items || []).slice(0, 6).map(i => `${i.title} ×${i.qty}`).join(', ');
  return `\n[ORDER LOOKUP] ${order.id}: status = ${STATUS_FRIENDLY[order.status] || order.status} (${order.status}).
Placed: ${order.placedAt}. Delivery: ${order.deliveryDate?.label || ''} ${order.slot?.label || ''}. Total ₹${order.totalInr} (${order.paymentMethod === 'cod' ? 'cash on delivery' : 'online payment', order.paymentStatus}).
Items: ${items || '—'}.
${verified ? 'Phone number VERIFIED — you may confirm the delivery details.' : 'Phone NOT verified — share the status only, never the address.'}`;
}

async function geminiChat(cfg, history, ctx) {
  const sys = SYSTEM_PROMPT + knowledgeText() + ctx;
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content).slice(0, 800) }]
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.aiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { maxOutputTokens: 220, temperature: 0.4 }
      })
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) throw new Error('gemini empty');
    return text;
  } finally { clearTimeout(timer); }
}

/* basic mode — no AI key needed. Keyword answers + WhatsApp handoff. */
function fallbackReply(message, ctx) {
  const m = String(message || '').toLowerCase();
  const s = loadSettings();
  const wa = String(s.business?.whatsapp || '918438765119').replace(/\D/g, '');
  const hand = 'For anything else, tap the WhatsApp button below — the shop will reply personally. 💬';
  if (ctx.includes('[ORDER LOOKUP]')) {
    const line = ctx.split('\n').find(l => l.startsWith('[ORDER LOOKUP]')) || '';
    if (line.includes('NOT FOUND')) return `Hmm, I can't find that order ID. Please double-check it from your confirmation email or the Track page. ${hand}`;
    const id = (line.match(/\[ORDER LOOKUP\] (RB-[A-Z0-9-]+):/) || [])[1] || 'your order';
    const status = (line.match(/status = ([^(]+)\(/) || [])[1]?.trim() || 'being processed';
    return `Order ${id}: **${status}**. You can also see it live on the Track page with your order ID + mobile number. 🛵 ${hand}`;
  }
  if (/(cancel|refund|return|damage|damaged|missing|bad|rotten|stale|complain)/.test(m))
    return `Sorry about that! 🙏 For cancellations before ~6 AM on delivery day use the Track page — for anything else, please tap the WhatsApp button below right away and the shop will sort it out (freshness promise: if it is not fresh, it is free).`;
  if (/(charge|fee|delivery cost|delivery charge|shipping|delivery fee)/.test(m)) {
    const d = s.delivery || {};
    return `Delivery is by road distance from the shop — ₹${(d.tiers || [])[0]?.feeInr || 20} nearby, up to ₹${(d.tiers || [])[(d.tiers || []).length - 1]?.feeInr || 100} at ${(d.maxRoadKm || 9)} km — and **FREE on baskets over ₹${d.freeOverInr || 500}**. 🚚`;
  }
  if (/(area|pincode|deliver to|do you deliver|location|address|my area|hosur|bagalur|mathigiri|kelamangalam|zuzuvadi)/.test(m))
    return `We deliver to homes in and around Hosur — up to about ${(s.delivery?.maxRoadKm || 9)} km road distance. Add your exact pin at checkout and we'll confirm instantly whether we reach you. 📍`;
  if (/(time|slot|when|morning|deliver|timing|hour)/.test(m)) {
    const slots = (s.delivery?.slots || []).map(x => x.label).join(' or ');
    return `We deliver in the morning — ${slots}. Order by night and wake up to fresh vegetables at your door. 🌅`;
  }
  if (/(pay|payment|upi|cash|cod|card|online|gpay|phonepe)/.test(m)) {
    const online = Boolean((s.payments?.onlineEnabled ?? s.payments?.payuEnabled));
    return `You can pay by Cash on Delivery${online ? ' or online — UPI, cards and netbanking at checkout' : ''}. 💳`;
  }
  if (/(order|track|where|status)/.test(m))
    return `To check your order, send me your order ID (like RB-20260922-A3F9K2) and the mobile number you ordered with — or open the Track page. 🔎`;
  if (/(price|cost|cheap|rate|kg|vegetable|available|stock|have)/.test(m))
    return `All vegetables with today's live prices are on the Shop page — tap any veggie to see every pack size and price. 🥬`;
  if (/(coupon|discount|offer|promo|loyalty|refer)/.test(m))
    return `Coupons can be applied at checkout 🎟 — after a delivered order you'll get a LOY-… loyalty coupon by email, and referrals earn REF-… coupons for both sides. 🎁`;
  if (/(human|person|call|talk|whatsapp|owner|agent|contact|number)/.test(m))
    return `Tap the WhatsApp button below to chat with the shop directly${s.business?.phoneDisplay ? ` — or call ${s.business.phoneDisplay}` : ''}. 📞`;
  return `I'm the Rebesta assistant 🌱 — ask me about your order, delivery charges, areas we serve, morning slots, payments or refunds. ${hand}`;
}

export async function supportReply(history) {
  const lastUser = [...history].reverse().find(m => m.role === 'user')?.content || '';
  const ctx = orderContext(lastUser);
  const cfg = supportConfig();
  if (cfg.enabled && cfg.aiKey) {
    try {
      const reply = await geminiChat(cfg, history, ctx);
      if (reply) return { reply, mode: 'ai' };
    } catch (error) {
      console.log(JSON.stringify({ event: 'support.ai.error', error: String(error?.message || error).slice(0, 200) }));
    }
  }
  return { reply: fallbackReply(lastUser, ctx), mode: 'basic' };
}
