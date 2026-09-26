import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { loadProducts, loadSettings, loadPartners, savePartners, readOrders, saveOrders, updateOrderStatus, updateProduct, createProduct, saveSettings, createBackup, awardLoyalty, awardReferral, dataVersions, loadSubscriptions, saveSubscriptions, getSubscription } from '../lib/store.js';
import { createPartner, updatePartner, deletePartner, publicPartner, freshPositions, haversineKm, etaMinutesFromKm, partnerScore } from '../lib/partners.js';
import { statusChangedEmail, rewardCouponEmail } from '../lib/mailer.js';
import { publicSubscription } from '../lib/subscriptions.js';
import { whatsappLink, sendWhatsAppAuto } from '../lib/whatsapp.js';
import { payuEnabled } from '../lib/payu.js';

export const router = express.Router();

function adminOnly(req, res, next) {
  const key = String(req.headers['x-admin-key'] || '');
  if (!key || key !== config.adminKey) {
    return res.status(401).json({ ok: false, error: 'Invalid admin key' });
  }
  next();
}

router.use(adminOnly);

router.get('/dashboard', (req, res) => {
  const orders = readOrders();
  const products = loadProducts();
  const today = new Date().toISOString().slice(0, 10);
  const activeOrders = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
  res.json({
    ok: true,
    metrics: {
      ordersToday: orders.filter(o => o.placedAt?.startsWith(today)).length,
      activeOrders: activeOrders.length,
      revenueTodayInr: orders.filter(o => o.placedAt?.startsWith(today) && o.status !== 'CANCELLED').reduce((s, o) => s + Number(o.totalInr || 0), 0),
      liveProducts: products.filter(p => p.active).length,
      lowStock: products.filter(p => p.active && p.stock <= 10).length
    }
  });
});

router.get('/products', (req, res) => {
  const products = loadProducts();
  res.json({ ok: true, products });
});

router.post('/products', (req, res) => {
  try {
    const product = createProduct(req.body || {});
    console.log(JSON.stringify({ event: 'product.created', handle: product.handle, title: product.title }));
    res.status(201).json({ ok: true, product });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not create the product' });
  }
});

router.patch('/products/:handle', (req, res) => {
  try {
    const product = updateProduct(req.params.handle, req.body || {});
    if (!product) return res.status(404).json({ ok: false, error: 'Product not found' });
    res.json({ ok: true, product });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not update product' });
  }
});

router.get('/settings', (req, res) => {
  const settings = loadSettings();
  res.json({ ok: true, settings, payuServerKeys: payuEnabled() });
});

router.patch('/settings', (req, res) => {
  try {
    const settings = loadSettings();
    const patch = req.body || {};
    if (patch.delivery) {
      const d = settings.delivery || (settings.delivery = {});
      for (const key of ['hubLat', 'hubLng', 'maxRoadKm', 'freeOverInr']) {
        if (patch.delivery[key] !== undefined) {
          const value = Number(patch.delivery[key]);
          if (!Number.isFinite(value) || value < 0) return res.status(400).json({ ok: false, error: `Invalid ${key}` });
          d[key] = value;
        }
      }
      if (patch.delivery.slotCapacity !== undefined) {
        const cap = Number(patch.delivery.slotCapacity);
        if (!Number.isInteger(cap) || cap < 1 || cap > 500) return res.status(400).json({ ok: false, error: 'Slot capacity must be 1–500 orders' });
        d.slotCapacity = cap;
      }
      if (Array.isArray(patch.delivery.tiers)) {
        const tiers = patch.delivery.tiers.map(tier => ({
          min: Number(tier.min),
          max: Number(tier.max),
          feeInr: Number(tier.feeInr),
          label: String(tier.label || `${tier.min}–${tier.max} km`).trim().slice(0, 40)
        }));
        const invalid = tiers.length < 1 || tiers.some(t => !Number.isFinite(t.min) || !Number.isFinite(t.max) || !Number.isFinite(t.feeInr) || t.min < 0 || t.max <= t.min || t.feeInr < 0);
        if (invalid) return res.status(400).json({ ok: false, error: 'Distance tiers are invalid' });
        d.tiers = tiers;
      }
      if (Array.isArray(patch.delivery.slots)) d.slots = patch.delivery.slots;
    }
    if (patch.business) {
      const current = settings.business || (settings.business = {});
      for (const key of ['name', 'whatsapp', 'phoneDisplay', 'city', 'fssai']) {
        if (patch.business[key] !== undefined) current[key] = String(patch.business[key]).trim();
      }
    }
    if (patch.promotions) {
      if (patch.promotions.loyalty) {
        const loyalty = patch.promotions.loyalty;
        const current = settings.promotions || (settings.promotions = {});
        const next = current.loyalty || (current.loyalty = {});
        if (loyalty.enabled !== undefined) next.enabled = Boolean(loyalty.enabled);
        for (const key of ['percent', 'minOrderInr', 'validityDays']) {
          if (loyalty[key] !== undefined) {
            const value = Number(loyalty[key]);
            if (!Number.isFinite(value) || value < 0) return res.status(400).json({ ok: false, error: `Invalid loyalty ${key}` });
            next[key] = Math.round(value);
          }
        }
      }
      if (patch.promotions.referral) {
        const referral = patch.promotions.referral;
        const current = settings.promotions || (settings.promotions = {});
        const next = current.referral || (current.referral = {});
        if (referral.enabled !== undefined) next.enabled = Boolean(referral.enabled);
        if (referral.bonusInr !== undefined) {
          const value = Number(referral.bonusInr);
          if (!Number.isFinite(value) || value < 10 || value > 500) return res.status(400).json({ ok: false, error: 'Referral bonus must be between 10 and 500' });
          next.bonusInr = Math.round(value);
        }
      }
      const promos = settings.promotions || (settings.promotions = {});
      if (Array.isArray(patch.promotions.coupons)) {
        const coupons = patch.promotions.coupons.map(c => {
          const code = String(c.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
          const type = c.type === 'percent' ? 'percent' : 'flat';
          const value = Number(c.value);
          const minOrderInr = Math.max(0, Number(c.minOrderInr) || 0);
          if (!code || !Number.isFinite(value) || value <= 0) throw new Error(`Coupon ${code || '(blank)'} has invalid values`);
          if (type === 'percent' && value > 90) throw new Error(`Coupon ${code}: percent off cannot exceed 90`);
          if (type === 'flat' && value > 10000) throw new Error(`Coupon ${code}: flat off cannot exceed \u20B910000`);
          const couponOut = { code, type, value, minOrderInr, active: c.active !== false };
          if (c.expiresAt && !Number.isNaN(new Date(c.expiresAt).getTime())) couponOut.expiresAt = new Date(c.expiresAt).toISOString();
          if (c.maxUses && Number.isFinite(Number(c.maxUses)) && Number(c.maxUses) > 0) {
            couponOut.maxUses = Math.round(Number(c.maxUses));
            couponOut.usedCount = Math.max(0, Math.round(Number(c.usedCount) || 0));
          }
          if (c.note) couponOut.note = String(c.note).slice(0, 120);
          return couponOut;
        });
        if (new Set(coupons.map(c => c.code)).size !== coupons.length) throw new Error('Coupon codes must be unique');
        promos.coupons = coupons;
      }
    }
    if (patch.content) {
      const current = settings.content || (settings.content = {});
      for (const key of ['homeBadge', 'homeTitle', 'homeSubtitle', 'deliveryNoteTitle', 'deliveryNoteText', 'deliveryNoteButton']) {
        if (patch.content[key] !== undefined) current[key] = String(patch.content[key]).trim().slice(0, 200);
      }
      if (Array.isArray(patch.content.testimonials)) {
        const testimonials = patch.content.testimonials.map(t => ({
          name: String(t.name || '').trim().slice(0, 60),
          text: String(t.text || '').trim().slice(0, 400),
          rating: Math.max(1, Math.min(5, Math.round(Number(t.rating) || 5))),
          area: String(t.area || '').trim().slice(0, 40)
        })).filter(t => t.name && t.text);
        current.testimonials = testimonials.slice(0, 12);
      }
    }
    if (patch.maintenance) {
      const current = settings.maintenance || (settings.maintenance = {});
      if (patch.maintenance.enabled !== undefined) current.enabled = Boolean(patch.maintenance.enabled);
      if (patch.maintenance.message !== undefined) current.message = String(patch.maintenance.message || '').trim().slice(0, 200);
    }
    if (patch.payments) {
      const current = settings.payments || (settings.payments = {});
      if (patch.payments.payuEnabled !== undefined) current.payuEnabled = Boolean(patch.payments.payuEnabled);
    }
    if (patch.integrations) {
      const current = settings.integrations || (settings.integrations = {});
      if (patch.integrations.gaId !== undefined) {
        const gaId = String(patch.integrations.gaId || '').trim();
        current.gaId = gaId === '' || /^G-[A-Z0-9]{6,12}$/.test(gaId) ? gaId : current.gaId || '';
      }
    }
    saveSettings(settings);
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not update settings' });
  }
});

router.get('/orders', (req, res) => {
  const status = String(req.query.status || '').toUpperCase();
  let orders = readOrders();
  if (status) orders = orders.filter(o => o.status === status);
  res.json({ ok: true, orders });
});

router.patch('/orders/:id/status', (req, res) => {
  try {
    const order = updateOrderStatus(req.params.id, String(req.body?.status || '').toUpperCase(), String(req.body?.note || ''));
    if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
    let rewards = null;
    if (order.status === 'DELIVERED') {
      const loyaltyCoupon = awardLoyalty(order);
      const referral = awardReferral(order);
      rewards = { loyaltyCoupon, referral };
      if (loyaltyCoupon) rewardCouponEmail(order, loyaltyCoupon, 'Your loyalty reward is here! \u{1F381}');
      if (referral) rewardCouponEmail(order, referral.friendCoupon, 'Referral thank-you! \u{1F381}');
    }
    statusChangedEmail(order);
    // WhatsApp: one-tap link in the response + auto-send if a provider is configured
    const event = ['CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(order.status) ? order.status : null;
    const wa = event ? whatsappLink(order, event) : null;
    if (event && order.status !== 'CANCELLED') sendWhatsAppAuto(event, order);
    res.json({ ok: true, order, rewards, whatsapp: wa });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not update order' });
  }
});

router.patch('/orders/:id/payment', (req, res) => {
  try {
    const allowed = ['PAY_ON_DELIVERY', 'PAID_CASH_ON_DELIVERY', 'PAID_ONLINE', 'REFUNDED', 'CANCELLED_NO_CHARGE'];
    const paymentStatus = String(req.body?.paymentStatus || '').toUpperCase();
    if (!allowed.includes(paymentStatus)) return res.status(400).json({ ok: false, error: 'Invalid payment status' });
    const orders = readOrders();
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
    order.paymentStatus = paymentStatus;
    order.updatedAt = new Date().toISOString();
    order.history.push({ status: order.status, at: order.updatedAt, note: `Payment marked ${paymentStatus}` });
    saveOrders(orders);
    res.json({ ok: true, order });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not update payment' });
  }
});

router.get('/orders.csv', (req, res) => {
  const orders = readOrders();
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const head = ['Order ID', 'Placed At', 'Customer', 'Phone', 'Address', 'Items', 'Subtotal INR', 'Discount INR', 'Coupon', 'Delivery Fee INR', 'Total INR', 'Payment', 'Payment Status', 'Order Status', 'Slot', 'Delivery Date'];
  const rows = orders.map(o => [
    o.id,
    o.placedAt,
    o.customer?.name || '',
    o.customer?.phone || '',
    [o.address?.line1, o.address?.area, o.address?.city, o.address?.pincode].filter(Boolean).join(', '),
    (o.items || []).map(i => `${i.title} x${i.qty}`).join('; '),
    o.subtotalInr,
    o.discountInr || 0,
    o.couponCode || '',
    o.deliveryFeeInr,
    o.totalInr,
    o.paymentMethod,
    o.paymentStatus,
    o.status,
    o.slot?.label || '',
    o.deliveryDate?.label || ''
  ]);
  const csv = [head, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  res.type('text/csv').attachment(`rebesta-orders-${new Date().toISOString().slice(0, 10)}.csv`).send(csv);
});

router.get('/backup', (req, res) => {
  const backup = createBackup();
  res.type('application/json').attachment(`rebesta-backup-${new Date().toISOString().slice(0, 10)}.json`).send(JSON.stringify(backup, null, 2));
});

/* ================= Weekly subscriptions (admin) ================= */

router.get('/subscriptions', (req, res) => {
  const subscriptions = loadSubscriptions().map(s => ({
    ...publicSubscription(s),
    phone: s.phone,
    nextRunLabel: s.nextRunOn
  }));
  res.json({ ok: true, subscriptions });
});

router.patch('/subscriptions/:id', (req, res) => {
  try {
    const subscription = getSubscription(req.params.id);
    if (!subscription) return res.status(404).json({ ok: false, error: 'Subscription not found' });
    const action = String(req.body?.action || '').toLowerCase();
    if (action === 'pause') {
      subscription.status = 'PAUSED';
      subscription.pauseReason = 'Paused by owner';
    } else if (action === 'resume') {
      subscription.status = 'ACTIVE';
      subscription.pauseReason = '';
    } else if (action === 'cancel') {
      subscription.status = 'CANCELLED';
      subscription.cancelledAt = new Date().toISOString();
    } else {
      return res.status(400).json({ ok: false, error: 'Action must be pause, resume or cancel' });
    }
    const all = loadSubscriptions();
    Object.assign(all.find(s => s.id === subscription.id), subscription);
    saveSubscriptions(all);
    res.json({ ok: true, subscription: { ...publicSubscription(subscription), phone: subscription.phone } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not update the subscription' });
  }
});

/* ================= Product photo upload (phone camera / gallery) ================= */

const UPLOAD_DIR = path.join(config.dataDir, 'uploads', 'products');

function sniffImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

router.post('/products/:handle/photo', (req, res) => {
  try {
    const dataUrl = String(req.body?.imageDataUrl || '');
    const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return res.status(400).json({ ok: false, error: 'Send a JPEG, PNG or WebP image' });
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length < 500) return res.status(400).json({ ok: false, error: 'Image looks empty' });
    if (buffer.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Image too large — keep it under 6 MB' });
    const ext = sniffImageType(buffer);
    if (!ext) return res.status(400).json({ ok: false, error: 'That file is not a valid image' });

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const file = `${String(req.params.handle).replace(/[^a-z0-9-]/gi, '')}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), buffer);
    const imagePath = `/img/products/${file}`;
    const product = updateProduct(req.params.handle, { image: imagePath });
    if (!product) return res.status(404).json({ ok: false, error: 'Product not found' });
    console.log(JSON.stringify({ event: 'product.photo_uploaded', handle: product.handle, file, bytes: buffer.length }));
    res.json({ ok: true, image: imagePath, product });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not save the photo' });
  }
});

/* ================= Delivery partners ================= */

const ACTIVE_STATUSES = ['PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'PENDING_PAYMENT'];

router.get('/partners', (req, res) => {
  const partners = loadPartners();
  const positions = freshPositions(6 * 60 * 60 * 1000);
  const orders = readOrders();
  res.json({
    ok: true,
    partners: partners.map(partner => {
      const row = positions.find(p => p.partner.id === partner.id);
      return {
        ...publicPartner(partner),
        lastPosition: row ? row.position : null,
        activeOrders: orders.filter(o => o.assignedPartnerId === partner.id && ACTIVE_STATUSES.includes(o.status)).length,
        ...partnerScore(orders, partner.id)
      };
    })
  });
});

router.post('/partners', (req, res) => {
  try {
    const partner = createPartner(req.body || {});
    res.status(201).json({ ok: true, partner: publicPartner(partner) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not create partner' });
  }
});

router.patch('/partners/:id', (req, res) => {
  try {
    const partner = updatePartner(req.params.id, req.body || {});
    if (!partner) return res.status(404).json({ ok: false, error: 'Partner not found' });
    res.json({ ok: true, partner: publicPartner(partner) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not update partner' });
  }
});

router.delete('/partners/:id', (req, res) => {
  const partner = deletePartner(req.params.id);
  if (!partner) return res.status(404).json({ ok: false, error: 'Partner not found' });
  const orders = readOrders();
  let unassigned = 0;
  for (const order of orders) {
    if (order.assignedPartnerId === partner.id) {
      delete order.assignedPartnerId;
      delete order.assignedPartnerName;
      order.updatedAt = new Date().toISOString();
      order.history.push({ status: order.status, at: order.updatedAt, note: `Partner ${partner.name} removed — order unassigned` });
      unassigned++;
    }
  }
  if (unassigned) saveOrders(orders);
  res.json({ ok: true, unassigned });
});

router.post('/orders/:id/assign', (req, res) => {
  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });
  const partnerId = req.body?.partnerId || null;
  if (partnerId) {
    const partner = loadPartners().find(p => p.id === partnerId);
    if (!partner) return res.status(404).json({ ok: false, error: 'Partner not found' });
    if (partner.active === false) return res.status(409).json({ ok: false, error: `${partner.name} is disabled — enable the partner first` });
    if (order.assignedPartnerId && order.assignedPartnerId !== partner.id) {
      order.history.push({ status: order.status, at: new Date().toISOString(), note: `Reassigned from ${order.assignedPartnerName || 'partner'} to ${partner.name}` });
    }
    order.assignedPartnerId = partner.id;
    order.assignedPartnerName = partner.name;
    if (!order.history?.some(h => h.note === `Assigned to ${partner.name} (${partner.id})`)) {
      order.history.push({ status: order.status, at: new Date().toISOString(), note: `Assigned to ${partner.name} (${partner.id})` });
    }
  } else {
    if (order.assignedPartnerId) {
      order.history.push({ status: order.status, at: new Date().toISOString(), note: `Unassigned from ${order.assignedPartnerName || 'partner'}` });
    }
    delete order.assignedPartnerId;
    delete order.assignedPartnerName;
  }
  order.updatedAt = new Date().toISOString();
  saveOrders(orders);
  res.json({ ok: true, order });
});

/* Live tracking feed for the admin map (includes per-order ETA from partner's live position) */
router.get('/tracking', (req, res) => {
  const settings = loadSettings();
  const orders = readOrders();
  res.json({
    ok: true,
    hub: { lat: settings.delivery?.hubLat ?? null, lng: settings.delivery?.hubLng ?? null },
    partners: freshPositions(30 * 60 * 1000).map(row => ({
      ...row,
      orders: orders
        .filter(o => o.assignedPartnerId === row.partner.id && ACTIVE_STATUSES.includes(o.status))
        .map(o => {
          const entry = { id: o.id, customer: o.customer?.name || '', totalInr: o.totalInr, slot: o.slot?.label || '', status: o.status };
          const pin = o.location && Number.isFinite(Number(o.location.lat)) ? o.location : null;
          if (pin) {
            entry.location = pin;
            const airKm = haversineKm({ lat: row.position.lat, lng: row.position.lng }, { lat: pin.lat, lng: pin.lng });
            entry.distanceKm = Math.round(airKm * 10) / 10;
            entry.etaMinutes = etaMinutesFromKm(airKm);
          }
          return entry;
        })
    }))
  });
});

/* Cheap version stamps so the dashboard can live-poll without heavy reloads */
router.get('/version', (req, res) => {
  res.json({ ok: true, versions: dataVersions() });
});
