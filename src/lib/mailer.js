import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { loadSettings } from './store.js';

const money = inr => `₹${Number(inr || 0).toLocaleString('en-IN')}`;

let cachedTransport = null;
let cachedKey = '';

/* SMTP credentials live in admin Settings (smtp section) with env fallback */
function smtpConfig() {
  const s = (loadSettings().smtp) || {};
  const merged = {
    host: String(s.host || config.smtp.host || '').trim(),
    port: Number(s.port || config.smtp.port || 465),
    user: String(s.user || config.smtp.user || '').trim(),
    pass: String(s.pass || config.smtp.pass || ''),
    from: String(s.from || config.smtp.from || s.user || config.smtp.user || '').trim(),
    notify: String(s.notify || config.smtp.notify || s.user || config.smtp.user || '').trim()
  };
  return merged;
}

export function notifyAddress() {
  return smtpConfig().notify;
}

export function mailerReady() {
  const c = smtpConfig();
  return Boolean(c.host && c.user && c.pass && c.from);
}

function transport() {
  if (!mailerReady()) return null;
  const c = smtpConfig();
  const key = `${c.host}:${c.port}:${c.user}:${c.pass.slice(-4)}`;
  if (!cachedTransport || cachedKey !== key) {
    cachedTransport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.port === 465,
      auth: { user: c.user, pass: c.pass }
    });
    cachedKey = key;
  }
  return cachedTransport;
}

const shell = (title, bodyHtml) => `<!doctype html><html><body style="margin:0;padding:0;background:#f2f5ee;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5ee;padding:22px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe7d8">
<tr><td style="background:linear-gradient(135deg,#0d8736,#075c1f);padding:20px 26px">
  <span style="color:#fff;font-size:19px;font-weight:800;letter-spacing:.02em">🥬 Rebesta Fresh</span><br>
  <span style="color:#bfe6cb;font-size:12px;font-weight:600">Farm-fresh vegetables · Hosur</span>
</td></tr>
<tr><td style="padding:26px">
  <h2 style="margin:0 0 14px;color:#17251b;font-size:17px">${title}</h2>
  ${bodyHtml}
</td></tr>
<tr><td style="padding:16px 26px;background:#f7faf4;border-top:1px solid #e6ecdf;color:#67766c;font-size:11px;line-height:1.6">
  Rebesta Fresh · Hosur, Tamil Nadu · WhatsApp +91 84387 65119<br>
  Track your order anytime: <a href="${config.appUrl}/track" style="color:#0d8736">${config.appUrl}/track</a>
</td></tr>
</table></td></tr></table></body></html>`;

const itemsTable = order => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:13px">
  ${order.items.map(i => `<tr>
    <td style="padding:7px 0;border-bottom:1px solid #eef2ea;color:#333">${i.title} <span style="color:#8b988f">(${i.unitLabel})</span></td>
    <td style="padding:7px 6px;border-bottom:1px solid #eef2ea;color:#8b988f;text-align:right">× ${i.qty}</td>
    <td style="padding:7px 0;border-bottom:1px solid #eef2ea;font-weight:700;text-align:right;white-space:nowrap">${money(i.priceInr * i.qty)}</td>
  </tr>`).join('')}
  ${Number(order.discountInr) > 0 ? `<tr><td colspan="2" style="padding:7px 0;color:#0d8736;font-weight:600">Coupon ${order.couponCode || ''}</td><td style="padding:7px 0;color:#0d8736;font-weight:700;text-align:right">−${money(order.discountInr)}</td></tr>` : ''}
  <tr><td style="padding:7px 0;color:#8b988f">Delivery</td><td></td><td style="padding:7px 0;text-align:right;font-weight:700">${Number(order.deliveryFeeInr) > 0 ? money(order.deliveryFeeInr) : 'FREE'}</td></tr>
  <tr><td style="padding:10px 0;font-size:15px;font-weight:800">Total</td><td></td><td style="padding:10px 0;text-align:right;font-size:15px;font-weight:800;color:#0d8736">${money(order.totalInr)}</td></tr>
</table>`;

export async function sendMail({ to, subject, title, bodyHtml }) {
  const tx = transport();
  if (!tx) {
    console.log(JSON.stringify({ event: 'mail.skipped', reason: 'smtp_not_configured', to, subject }));
    return false;
  }
  try {
    await tx.sendMail({ from: smtpConfig().from, to, subject, html: shell(title, bodyHtml) });
    console.log(JSON.stringify({ event: 'mail.sent', to, subject }));
    return true;
  } catch (error) {
    console.error(JSON.stringify({ event: 'mail.error', to, subject, error: String(error?.message || error).slice(0, 300) }));
    return false;
  }
}

const dateLabel = iso => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function orderPlacedEmails(order) {
  const slotText = order.slot ? `${dateLabel(order.deliveryDate || order.placedAt)} · ${order.slot.label || order.slot.id}` : 'confirmed on WhatsApp';
  // To the customer
  sendMail({
    to: order.customer?.email || '',
    subject: `Order confirmed — ${order.id}`,
    title: 'Thank you for your order! 🎉',
    bodyHtml: `
      <p style="margin:0 0 4px;color:#333;font-size:13px">Hi ${order.customer?.name || 'there'}, your order <strong>${order.id}</strong> is in.</p>
      ${itemsTable(order)}
      <p style="margin:10px 0 0;color:#333;font-size:13px"><strong>Delivery:</strong> ${slotText}<br>
      <strong>Payment:</strong> ${order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online (PayU)'}<br>
      <strong>Saving this ID:</strong> ${order.id} + your phone number lets you track it anytime.</p>`
  });
  // To the shop owner
  sendMail({
    to: smtpConfig().notify,
    subject: `🛒 New order ${order.id} — ${money(order.totalInr)}`,
    title: 'New order received!',
    bodyHtml: `
      <p style="margin:0;color:#333;font-size:13px"><strong>${order.customer?.name}</strong> · ${order.customer?.phone}<br>
      ${order.address?.line1}, ${order.address?.area || ''} ${order.address?.pincode || ''}</p>
      ${itemsTable(order)}
      <p style="margin:10px 0 0;color:#333;font-size:13px"><strong>Slot:</strong> ${slotText} · <strong>Payment:</strong> ${order.paymentMethod === 'cod' ? 'COD' : 'Online'}</p>
      <p style="margin:10px 0 0"><a href="${config.appUrl}/admin" style="display:inline-block;background:#0d8736;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:9px">Open admin dashboard</a></p>`
  });
}

const STATUS_LABELS = { CONFIRMED: 'confirmed ✅', PACKING: 'being packed 📦', OUT_FOR_DELIVERY: 'out for delivery 🛵', DELIVERED: 'delivered 🎉', CANCELLED: 'cancelled' };

export function statusChangedEmail(order) {
  if (!order.customer?.email || !STATUS_LABELS[order.status]) return;
  sendMail({
    to: order.customer.email,
    subject: `Order ${order.id} — ${STATUS_LABELS[order.status]}`,
    title: `Your order is ${STATUS_LABELS[order.status]}`,
    bodyHtml: `<p style="margin:0;color:#333;font-size:13px">Order <strong>${order.id}</strong> is now <strong>${STATUS_LABELS[order.status]}</strong>.
    ${order.status === 'OUT_FOR_DELIVERY' ? 'Your vegetables are on the way — keep the exact amount ready if paying cash. 💵' : ''}
    ${order.status === 'DELIVERED' ? 'Enjoy your fresh produce! See you soon. 🥬' : ''}</p>`
  });
}

export function rewardCouponEmail(order, coupon, heading) {
  if (!order.customer?.email) return;
  sendMail({
    to: order.customer.email,
    subject: `🎁 Your reward coupon ${coupon.code} is here!`,
    title: heading || 'A little thank-you from Rebesta Fresh 🎁',
    bodyHtml: `
      <p style="margin:0 0 12px;color:#333;font-size:13px">Hi ${order.customer?.name || 'there'}, here's a reward for order <strong>${order.id}</strong>:</p>
      <div style="border:2px dashed #0d8736;border-radius:12px;padding:16px;text-align:center;margin:0 0 12px">
        <div style="font-size:24px;font-weight:900;letter-spacing:.12em;color:#0d8736">${coupon.code}</div>
        <div style="color:#333;font-size:13px;margin-top:5px"><strong>${money(coupon.value)}</strong> off · min basket ${money(coupon.minOrderInr || 0)} · valid till ${dateLabel(coupon.expiresAt)}</div>
      </div>
      <p style="margin:0;color:#333;font-size:13px">Apply it at checkout on your next order. Thank you for shopping farm-fresh! 🌱</p>`
  });
}
