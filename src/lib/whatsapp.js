/* Rebesta Fresh — WhatsApp order updates 📲
   Two modes, zero breaking changes:

   1. ONE-TAP (default, ₹0, live today):
      Partner/admin taps 💬 → wa.me deep link opens WhatsApp on their phone with
      the update message pre-filled. No API, no signup, no cost.

   2. AUTO-SEND (optional, later):
      settings.whatsapp.provider = { type: 'meta' | 'webhook', ... } → messages
      are also sent automatically. Ask before wiring a paid provider.
*/
import { loadSettings } from './store.js';
import { config } from '../config.js';

export const WHATSAPP_EVENTS = ['ORDER_PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

export const DEFAULT_TEMPLATES = {
  ORDER_PLACED: '🥬 Hi {firstName}! Your Rebesta Fresh order {orderId} is placed.\n\n{items}\nTotal: {total} ({payment})\nDelivery: {slot}, {date}.\n\nTrack it live: {link}',
  CONFIRMED: '✅ Order {orderId} is confirmed, {firstName}! We are sourcing your vegetables fresh from the farms.',
  PACKING: '🧺 We are packing your order {orderId} with care — coming your way in the {slot}, {date}.',
  OUT_FOR_DELIVERY: '🛵 Good news {firstName}! Order {orderId} is OUT FOR DELIVERY with {partner}.\nETA: about {eta} minutes.\n\nLive tracking: {link}',
  DELIVERED: '🎉 Delivered! Order {orderId} was handed over by {partner}.\nEnjoy your fresh vegetables, {firstName}! 🥬\nOrder again anytime: {shop}',
  CANCELLED: 'Hi {firstName}, your Rebesta Fresh order {orderId} has been cancelled as requested. We hope to serve you again soon! 🌱'
};

function phone10(raw) {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}

export function waPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return null;
  return digits.startsWith('91') && digits.length === 12 ? digits : `91${last10}`;
}

function templateFor(event) {
  const custom = loadSettings().whatsapp?.templates?.[event];
  return typeof custom === 'string' && custom.trim() ? custom : (DEFAULT_TEMPLATES[event] || '');
}

const money = v => `₹${Number(v || 0) % 1 === 0 ? Number(v || 0) : Number(v || 0).toFixed(2)}`;

export function orderContext(order, extra = {}) {
  const name = String(order.customer?.name || '').trim();
  const items = (order.items || []).map(i => `• ${i.title} × ${i.qty}`).join('\n');
  return {
    name: name || 'customer',
    firstName: name.split(' ')[0] || 'there',
    orderId: order.id,
    total: money(order.totalInr),
    payment: order.paymentMethod === 'cod' ? 'pay on delivery' : 'paid online',
    items,
    itemCount: (order.items || []).reduce((s, i) => s + Number(i.qty || 0), 0),
    slot: order.slot?.label || 'morning slot',
    date: order.deliveryDate?.label || '',
    partner: extra.partner || order.assignedPartnerName || 'our delivery partner',
    eta: extra.etaMinutes ? `${extra.etaMinutes}` : '20–30',
    link: `${config.appUrl}/track?id=${encodeURIComponent(order.id)}`,
    shop: config.appUrl
  };
}

export function renderWhatsApp(event, order, extra = {}) {
  const template = templateFor(event);
  if (!template) return '';
  const ctx = orderContext(order, extra);
  return template.replace(/\{(\w+)\}/g, (m, key) => (ctx[key] !== undefined ? String(ctx[key]) : m));
}

/* One-tap deep link — the ₹0 channel used by partner + admin apps */
export function whatsappLink(order, event, extra = {}) {
  const to = waPhone(order?.customer?.phone);
  if (!to) return null;
  const text = renderWhatsApp(event, order, extra);
  if (!text) return null;
  return { phone: to, text, url: `https://api.whatsapp.com/send/?phone=${to}&text=${encodeURIComponent(text)}` };
}

/* Optional auto-send through a configured provider. Never throws. */
export async function sendWhatsAppAuto(event, order, extra = {}) {
  try {
    const provider = loadSettings().whatsapp?.provider;
    if (!provider?.enabled || !provider.type || provider.type === 'none') return { sent: false, reason: 'not-configured' };
    const to = waPhone(order?.customer?.phone);
    if (!to) return { sent: false, reason: 'no-phone' };
    const text = renderWhatsApp(event, order, extra);
    if (!text) return { sent: false, reason: 'no-template' };

    let response;
    if (provider.type === 'meta') {
      // Meta WhatsApp Cloud API (graph.facebook.com)
      response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(provider.phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
        signal: AbortSignal.timeout(10000)
      });
    } else if (provider.type === 'webhook') {
      // Generic reseller webhook (AiSensy/Gupshup style) — {to, text} JSON + optional bearer token
      response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider.token ? { Authorization: `Bearer ${provider.token}` } : {})
        },
        body: JSON.stringify({ to, text, ...(provider.extra || {}) }),
        signal: AbortSignal.timeout(10000)
      });
    } else {
      return { sent: false, reason: 'unknown-provider' };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { sent: false, reason: `http-${response.status}`, body: body.slice(0, 300) };
    }
    console.log(JSON.stringify({ event: 'whatsapp.sent', order: order.id, channel: event, to, provider: provider.type }));
    return { sent: true };
  } catch (error) {
    console.error(JSON.stringify({ event: 'whatsapp.error', order: order?.id, error: String(error?.message || error).slice(0, 200) }));
    return { sent: false, reason: 'error' };
  }
}
