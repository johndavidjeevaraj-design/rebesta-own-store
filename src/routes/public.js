import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import {
  loadSettings,
  findCoupon,
  couponDiscount,
  markCouponUsed,
  publicCatalog,
  getProduct,
  buildCart,
  addOrder,
  getOrder,
  maskCustomer,
  markPayuPayment,
  ordersByPhone,
  cancelOrderPublic
} from '../lib/store.js';
import { orderPlacedEmails } from '../lib/mailer.js';
import { quoteDelivery, reverseGeocode } from '../lib/delivery.js';
import { createPayuPayment, validatePayuResponse } from '../lib/payu.js';
import { findPartnerById, getPosition, haversineKm, etaMinutesFromKm } from '../lib/partners.js';

export const router = express.Router();

const randomSku = () => crypto.randomBytes(4).toString('hex');

function flattenError(res, error, fallback = 'Request failed') {
  const status = Number(error.status || error.statusCode || 500);
  const message = status >= 500 && status !== 503 ? fallback : (error.message || fallback);
  res.status(status).json({ ok: false, error: message });
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  return '';
}

function normalizeAddress(input = {}) {
  return {
    line1: String(input.line1 || '').trim(),
    line2: String(input.line2 || '').trim(),
    area: String(input.area || '').trim(),
    city: String(input.city || 'Hosur').trim() || 'Hosur',
    state: String(input.state || 'Tamil Nadu').trim() || 'Tamil Nadu',
    pincode: String(input.pincode || '').replace(/\D/g, '').slice(0, 6),
    lat: input.lat ?? input.latitude,
    lng: input.lng ?? input.longitude,
    mapLabel: String(input.mapLabel || input.label || '').trim()
  };
}

router.get('/settings', (req, res) => {
  const settings = loadSettings();
  res.json({
    ok: true,
    business: settings.business,
    content: settings.content || {},
    delivery: {
      hubLat: settings.delivery?.hubLat,
      hubLng: settings.delivery?.hubLng,
      maxRoadKm: settings.delivery?.maxRoadKm,
      freeOverInr: settings.delivery?.freeOverInr,
      tiers: settings.delivery?.tiers,
      slots: settings.delivery?.slots
    },
    payments: {
      codEnabled: Boolean(settings.payments?.cod),
      onlineEnabled: Boolean(settings.payments?.payuEnabled && config.payu.key && config.payu.salt)
    },
    maintenance: {
      enabled: Boolean(settings.maintenance?.enabled),
      message: String(settings.maintenance?.message || '')
    },
    testimonials: Array.isArray(settings.content?.testimonials) ? settings.content.testimonials.slice(0, 12) : [],
    rewards: {
      loyaltyEnabled: Boolean(settings.promotions?.loyalty?.enabled),
      referralEnabled: Boolean(settings.promotions?.referral?.enabled),
      referralBonusInr: Number(settings.promotions?.referral?.bonusInr || 0)
    },
    requestId: randomSku()
  });
});

router.get('/products', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  let products = publicCatalog();
  if (category) products = products.filter(p => p.category === category);
  if (q) {
    products = products.filter(p => [p.title, p.description, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(q));
  }
  const categories = [...new Set(publicCatalog().map(p => p.category))].sort();
  res.json({ ok: true, count: products.length, categories, products });
});

router.get('/products/featured', (req, res) => {
  const products = publicCatalog().filter(p => p.featured).slice(0, 12);
  res.json({ ok: true, products });
});

router.get('/products/:handle', (req, res) => {
  const product = getProduct(req.params.handle);
  if (!product || !product.active) return res.status(404).json({ ok: false, error: 'Product not found' });
  res.json({ ok: true, product });
});

router.get('/location/reverse', async (req, res) => {
  try {
    const location = await reverseGeocode(req.query.lat, req.query.lng);
    res.json({ ok: true, location });
  } catch (error) { flattenError(res, error, 'Could not reverse geocode this pin'); }
});

router.post('/quote', async (req, res) => {
  try {
    const cart = buildCart(req.body?.items || []);
    const address = normalizeAddress(req.body?.address || {});
    const quote = await quoteDelivery({ cart, location: req.body?.location || {}, address });
    res.json({ ok: true, quote });
  } catch (error) { flattenError(res, error, 'Could not calculate delivery'); }
});

router.post('/coupon/check', (req, res) => {
  try {
    const coupon = findCoupon(req.body?.code);
    const subtotal = Number(req.body?.subtotalInr || 0);
    if (!coupon) return res.status(400).json({ ok: false, error: 'That coupon code is not valid' });
    const minOrderInr = Number(coupon.minOrderInr || 0);
    if (subtotal < minOrderInr) {
      return res.status(400).json({ ok: false, error: `Add items worth ${'\u20B9'}${minOrderInr - subtotal} more to use ${coupon.code} (min basket ${'\u20B9'}${minOrderInr})` });
    }
    const discountInr = couponDiscount(coupon, subtotal);
    res.json({ ok: true, coupon: { code: coupon.code, type: coupon.type, value: Number(coupon.value || 0), minOrderInr, discountInr } });
  } catch (error) {
    flattenError(res, error, 'Could not check coupon');
  }
});

router.post('/orders', async (req, res) => {
  try {
    const settingsNow = loadSettings();
    if (settingsNow.maintenance?.enabled) {
      throw Object.assign(new Error(settingsNow.maintenance?.message || 'We are briefly paused for restocking. Please order again in a while!'), { status: 503 });
    }
    const cart = buildCart(req.body?.items || []);
    const customer = {
      name: String(req.body?.customer?.name || '').trim(),
      phone: normalizePhone(req.body?.customer?.phone),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body?.customer?.email || '')) ? String(req.body?.customer?.email).trim().toLowerCase() : ''
    };
    if (customer.name.length < 2) throw Object.assign(new Error('Enter your full name'), { status: 400 });
    if (!customer.phone) throw Object.assign(new Error('Enter a valid Indian mobile number'), { status: 400 });

    const address = normalizeAddress(req.body?.address || {});
    if (address.line1.length < 5) throw Object.assign(new Error('Enter your house/flat/street address'), { status: 400 });
    if (!/^\d{6}$/.test(address.pincode)) throw Object.assign(new Error('Enter a valid 6-digit pincode'), { status: 400 });

    const location = req.body?.location || {};
    const quote = await quoteDelivery({ cart, location, address });
    if (!quote.eligible) throw Object.assign(new Error(quote.message), { status: 400 });

    const slot = (quote.slots || []).find(s => s.id === req.body?.slotId);
    if (!slot) throw Object.assign(new Error('Choose a delivery slot'), { status: 400 });

    const paymentMethod = String(req.body?.paymentMethod || 'cod').toLowerCase();
    const onlineEnabled = Boolean(loadSettings().payments?.payuEnabled && config.payu.key && config.payu.salt);
    if (paymentMethod === 'online' && !onlineEnabled) {
      throw Object.assign(new Error('Online payment is not configured yet. Please choose Cash on Delivery.'), { status: 400 });
    }
    if (!['cod', 'online'].includes(paymentMethod)) throw Object.assign(new Error('Choose a valid payment method'), { status: 400 });

    const deliveryFee = Number(quote.deliveryFeeInr || 0);
    let discountInr = 0;
    let couponCode = '';
    if (req.body?.couponCode) {
      const coupon = findCoupon(req.body.couponCode);
      if (!coupon) throw Object.assign(new Error('Coupon code is not valid'), { status: 400 });
      discountInr = couponDiscount(coupon, cart.subtotalInr);
      if (!discountInr) {
        throw Object.assign(new Error(`Coupon ${coupon.code} needs a minimum basket of ${'\u20B9'}${Number(coupon.minOrderInr || 0)}`), { status: 400 });
      }
      couponCode = coupon.code;
    }
    let referredBy = '';
    if (req.body?.referredBy) {
      referredBy = normalizePhone(req.body.referredBy);
      if (!referredBy) throw Object.assign(new Error('Referral phone number looks invalid'), { status: 400 });
      if (referredBy === customer.phone) throw Object.assign(new Error('Referral phone cannot be your own number'), { status: 400 });
    }
    const total = Math.round((cart.subtotalInr - discountInr + deliveryFee) * 100) / 100;
    const order = addOrder({
      customer,
      address,
      items: cart.lines,
      subtotalInr: cart.subtotalInr,
      discountInr,
      couponCode,
      deliveryFeeInr: deliveryFee,
      totalInr: total,
      distanceKm: quote.distanceKm,
      deliveryTierLabel: quote.deliveryTier?.label || '',
      freeDeliveryApplied: Boolean(quote.freeApplied),
      deliveryDate: quote.deliveryDate,
      slot,
      location: quote.location,
      paymentMethod,
      referredBy,
      notes: String(req.body?.notes || '').trim().slice(0, 500),
      source: 'own-store-web'
    });
    if (couponCode) markCouponUsed(couponCode);
    orderPlacedEmails(order);

    const settings = loadSettings();
    const whatsappDigits = String(settings.business?.whatsapp || '918438765119').replace(/\D/g, '');
    const lines = order.items.map(item => `• ${item.title} × ${item.qty} — ₹${item.lineTotalInr}`).join('\n');
    const message = `Rebesta Fresh order ${order.id}\n\n${lines}\n\nSubtotal: ₹${order.subtotalInr}\nDelivery: ₹${order.deliveryFeeInr}\nTotal: ₹${order.totalInr}\nName: ${order.customer.name}\nPhone: ${order.customer.phone}\nDelivery: ${order.slot.label} (${order.deliveryDate.label})\nAddress: ${address.line1}, ${address.area || ''}, ${address.city} ${address.pincode}\nExact pin: ${quote.location.lat}, ${quote.location.lng}`;
    const whatsappUrl = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`;
    const payu = paymentMethod === 'online' ? createPayuPayment(order) : null;

    res.status(201).json({
      ok: true,
      order: maskCustomer(order),
      orderId: order.id,
      whatsappUrl,
      payu: payu ? { action: payu.action, method: payu.method, fields: payu.fields } : null
    });
  } catch (error) { flattenError(res, error, 'Could not place this order'); }
});

async function payuCallback(req, res) {
  const payload = { ...(typeof req.query === 'object' ? req.query : {}), ...(typeof req.body === 'object' ? req.body : {}) };
  const orderId = String(payload.udf1 || payload.txnid || '').trim().toUpperCase();
  const order = getOrder(orderId);
  try {
    const result = validatePayuResponse(payload, order);
    if (!result.valid) return res.status(400).type('text/plain').send(`PayU verification failed: ${result.reason}`);
    markPayuPayment(order.id, {
      success: result.success,
      reference: payload.mihpayid || '',
      mode: payload.mode || '',
      raw: payload
    });
    return res.redirect(303, `/order-success?id=${encodeURIComponent(order.id)}&payment=${result.success ? 'paid' : 'failed'}`);
  } catch (error) {
    console.error(JSON.stringify({ event: 'payu.callback.error', error: String(error?.message || error).slice(0, 500) }));
    return res.status(500).type('text/plain').send('Payment verification failed. Contact Rebesta Fresh with your payment reference.');
  }
}

router.get('/orders/history', (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.status(400).json({ ok: false, error: 'Enter a valid phone number' });
  res.json({ ok: true, orders: ordersByPhone(phone) });
});

router.post('/orders/:id/cancel', (req, res) => {
  try {
    const order = cancelOrderPublic(req.params.id, req.body?.phone);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
    res.json({ ok: true, order: maskCustomer(order) });
  } catch (error) { flattenError(res, error, 'Could not cancel this order'); }
});

router.get('/payments/payu/callback', payuCallback);
router.post('/payments/payu/callback', payuCallback);

router.get('/orders/:id', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
  const phone = normalizePhone(req.query.phone);
  // Public tracking by link ID; link is intentionally long/random. Full address is masked.
  const payload = { ok: true, order: maskCustomer(order), phoneVerified: phone ? order.customer?.phone === phone : null };
  // Live partner location for the customer while the order is on the road
  if (order.assignedPartnerId && order.status === 'OUT_FOR_DELIVERY') {
    const partner = findPartnerById(order.assignedPartnerId);
    const position = partner ? getPosition(partner.id, 5 * 60 * 1000) : null;
    if (partner && position) {
      const pin = order.location && Number.isFinite(Number(order.location.lat)) ? order.location : null;
      payload.deliveryPartner = {
        name: partner.name,
        lat: position.lat,
        lng: position.lng,
        updatedAt: position.updatedAt,
        ...(pin ? { etaMinutes: etaMinutesFromKm(haversineKm({ lat: position.lat, lng: position.lng }, { lat: pin.lat, lng: pin.lng })) } : {})
      };
    } else if (partner) {
      payload.deliveryPartner = { name: partner.name, lat: null, lng: null, updatedAt: null };
    }
  }
  res.json(payload);
});
