import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { rateLimit } from '../lib/rateLimit.js';
import { loadProducts, saveProducts, loadSettings, loadPartners, savePartners, readOrders, saveOrders, updateOrderStatus, updateProduct, createProduct, deleteProduct, saveSettings, createBackup, awardLoyalty, awardReferral, dataVersions, loadSubscriptions, saveSubscriptions, getSubscription, cashSummary, recordCashReceived, loadReviews, setReviewApproval, deleteReview, isOrderReceived, isPendingPaymentOrder } from '../lib/store.js';
import { readSupportQueries } from '../lib/support.js';
import { createPartner, updatePartner, deletePartner, publicPartner, freshPositions, haversineKm, etaMinutesFromKm, partnerScore } from '../lib/partners.js';
import { statusChangedEmail, rewardCouponEmail } from '../lib/mailer.js';
import { publicSubscription } from '../lib/subscriptions.js';
import { whatsappLink, sendWhatsAppAuto } from '../lib/whatsapp.js';
import { payuEnabled } from '../lib/payu.js';
import { cashfreeEnabled, loadCashfreeConfig, createCashfreePayment } from '../lib/cashfree.js';
import { mailerReady } from '../lib/mailer.js';
import { sendMorningDigest } from '../lib/digest.js';

export const router = express.Router();

/* every admin call needs the key — compare in constant time (no early-exit
   string compare) and throttle guesses so the key can't be brute-forced */
function keyMatches(provided) {
  try {
    const a = crypto.createHash('sha256').update(String(provided || '')).digest();
    const b = crypto.createHash('sha256').update(String(config.adminKey || '')).digest();
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

router.use(rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many admin requests — slow down.' }));

function adminOnly(req, res, next) {
  const key = String(req.headers['x-admin-key'] || '');
  if (!key || !keyMatches(key)) {
    return res.status(401).json({ ok: false, error: 'Invalid admin key' });
  }
  next();
}

router.use(adminOnly);

const ORDER_CLEANUP_ORIGINALS = [
  // Treat the newly supplied middle initial as the canonical display name;
  // the shorter name remains an alias for the same single keeper order.
  { keys: ['naveen vishor', 'naveen vishor n'], label: 'Naveen Vishor N' },
  { keys: ['chithra'], label: 'Chithra' },
  { keys: ['hasini'], label: 'Hasini' }
];
const ORDER_CLEANUP_TOKEN_TTL_MS = 5 * 60 * 1000;

function normalizeOrderCustomerName(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function summarizeCleanupOrder(order) {
  return {
    id: String(order?.id || '(missing ID)').slice(0, 100),
    name: String(order?.customer?.name || '(no customer name)').slice(0, 120),
    status: String(order?.status || 'UNKNOWN').slice(0, 40),
    placedAt: String(order?.placedAt || '').slice(0, 64)
  };
}

function analyzeOrderCleanup(orders) {
  const counts = new Map(ORDER_CLEANUP_ORIGINALS.map(original => [original.label, 0]));
  const kept = [];
  const removed = [];
  for (const order of orders) {
    const key = normalizeOrderCustomerName(order?.customer?.name);
    const original = ORDER_CLEANUP_ORIGINALS.find(item => item.keys.includes(key));
    if (original) {
      counts.set(original.label, counts.get(original.label) + 1);
      kept.push(order);
    } else {
      removed.push(order);
    }
  }
  const preservedByName = ORDER_CLEANUP_ORIGINALS.map(original => ({
    name: original.label,
    count: counts.get(original.label)
  }));
  const issues = preservedByName
    .filter(item => item.count !== 1)
    .map(item => `${item.name}: expected exactly one original order, found ${item.count}`);
  return { kept, removed, preservedByName, issues, canDelete: issues.length === 0 && removed.length > 0 };
}

function orderCleanupDigest(orders) {
  return crypto.createHash('sha256').update(JSON.stringify(orders)).digest('hex');
}

function createOrderCleanupToken(orders) {
  const payload = Buffer.from(JSON.stringify({
    digest: orderCleanupDigest(orders),
    expiresAt: Date.now() + ORDER_CLEANUP_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(12).toString('hex')
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', String(config.adminKey)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyOrderCleanupToken(token) {
  try {
    const rawToken = String(token || '');
    if (rawToken.length > 2048) return null;
    const [payload, suppliedSignature, extra] = rawToken.split('.');
    if (!payload || !suppliedSignature || extra !== undefined) return null;
    const expected = crypto.createHmac('sha256', String(config.adminKey)).update(payload).digest();
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded.digest !== 'string' || !Number.isFinite(decoded.expiresAt) || decoded.expiresAt < Date.now()) return null;
    return decoded;
  } catch { return null; }
}

router.get('/dashboard', (req, res) => {
  const receivedOrders = readOrders().filter(isOrderReceived);
  const products = loadProducts();
  const today = new Date().toISOString().slice(0, 10);
  const activeOrders = receivedOrders.filter(o => !['DELIVERED', 'CANCELLED'].includes(String(o.status || '').toUpperCase()) && String(o.paymentStatus || '').toUpperCase() !== 'REFUNDED');
  const todayOrders = receivedOrders.filter(o => o.placedAt?.startsWith(today) && String(o.status || '').toUpperCase() !== 'CANCELLED');
  const revenueOrders = todayOrders.filter(o => String(o.paymentStatus || '').toUpperCase() !== 'REFUNDED');
  res.json({
    ok: true,
    metrics: {
      ordersToday: todayOrders.length,
      activeOrders: activeOrders.length,
      revenueTodayInr: revenueOrders.reduce((s, o) => s + Number(o.totalInr || 0), 0),
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

/* Rename (or merge) a category across the whole catalog in one atomic write.
   Customers see the change instantly — shop chips derive from the catalog. */
router.post('/categories/rename', (req, res) => {
  try {
    const from = String(req.body?.from || '').trim();
    const to = String(req.body?.to || '').trim();
    if (!from || !to) return res.status(400).json({ ok: false, error: 'Both the current and new category names are required' });
    if (from === to) return res.status(400).json({ ok: false, error: 'That is already the name' });
    const products = loadProducts();
    let moved = 0;
    for (const p of products) {
      if (String(p.category || '').trim() === from) { p.category = to; moved++; }
    }
    if (!moved) return res.status(404).json({ ok: false, error: `No products use the category "${from}"` });
    saveProducts(products);
    console.log(JSON.stringify({ event: 'category.renamed', from, to, moved }));
    res.json({ ok: true, moved, to });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not rename the category' });
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

/* Remove a product from the catalog entirely. Guarded: a product inside an
   active weekly subscription can't be removed (its weekly order build would
   fail) — switch it off ("Live") instead in that case. */
router.delete('/products/:handle', (req, res) => {
  try {
    const handle = String(req.params.handle || '').trim();
    const activeSubs = loadSubscriptions().filter(s => String(s.status || '').toUpperCase() !== 'CANCELLED' && (s.items || []).some(i => i.handle === handle));
    if (activeSubs.length) {
      return res.status(409).json({
        ok: false,
        error: `${activeSubs.length} active weekly subscription${activeSubs.length > 1 ? 's' : ''} still contain this product. Cancel or pause ${activeSubs.length > 1 ? 'them' : 'it'} in the Subscriptions tab first — or simply switch the product off with the "Live" checkbox.`
      });
    }
    const removed = deleteProduct(handle);
    if (!removed) return res.status(404).json({ ok: false, error: 'Product not found' });
    console.log(JSON.stringify({ event: 'product.deleted', handle: removed.handle, title: removed.title }));
    res.json({ ok: true, product: removed });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not remove the product' });
  }
});

router.get('/settings', (req, res) => {
  const settings = loadSettings();
  const smtpSafe = settings.smtp ? { ...settings.smtp, pass: settings.smtp.pass ? '********' : '' } : undefined;
  const supportSafe = settings.support ? { ...settings.support, aiKey: settings.support.aiKey ? '********' : '' } : undefined;
  const cf = loadCashfreeConfig() || {};
  res.json({ ok: true, settings: { ...settings, smtp: smtpSafe, support: supportSafe }, payuServerKeys: payuEnabled(), mailReady: mailerReady(), supportReady: Boolean(settings.support?.enabled !== false && settings.support?.aiKey),
    cashfree: { mode: cf.mode || null, hasAppId: Boolean(cf.appId), hasSecretKey: Boolean(cf.secretKey), enabled: cashfreeEnabled() } });
});

/* 💬 customer queries that were escalated to a human ("tickets") */
router.get('/support-queries', (req, res) => {
  const all = readSupportQueries();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  res.json({ ok: true, queries: all.slice(0, 30), todayCount: all.filter(q => new Date(q.at).getTime() > dayAgo).length, total: all.length });
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
    if (patch.support) {
      const current = settings.support || (settings.support = {});
      const sup = patch.support;
      if (sup.enabled !== undefined) current.enabled = Boolean(sup.enabled);
      if (sup.model !== undefined) current.model = String(sup.model).trim().slice(0, 40) || 'gemini-2.0-flash';
      if (sup.clearKey) delete current.aiKey;
      else if (typeof sup.aiKey === 'string' && sup.aiKey && sup.aiKey !== '(saved)') current.aiKey = sup.aiKey.trim().slice(0, 200);
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
      if (patch.payments.onlineEnabled !== undefined) current.onlineEnabled = Boolean(patch.payments.onlineEnabled);
      if (patch.payments.payuEnabled !== undefined) current.payuEnabled = Boolean(patch.payments.payuEnabled);
    }
    if (patch.smtp) {
      const current = settings.smtp || (settings.smtp = {});
      const s = patch.smtp;
      if (s.user !== undefined) current.user = String(s.user || '').trim().slice(0, 120);
      const passRaw = String(s.pass || '').replace(/\s+/g, '');
      if (passRaw && !/^(\*+)$/.test(passRaw)) current.pass = passRaw.slice(0, 120); // never save the masked value back
      if (s.notify !== undefined) current.notify = String(s.notify || '').trim().slice(0, 120);
      if (String(s.user || '').trim()) {
        // Gmail by default; auto host/port unless customised
        current.host = String(s.host || '').trim().slice(0, 120) || 'smtp.gmail.com';
        current.port = Number(s.port) === 587 ? 587 : 465;
        current.from = current.user;
      }
      if (String(s.user || '').trim() === '' && String(s.pass || '').trim() === '') {
        // clearing both = disable email
        delete settings.smtp;
      }
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
  const view = String(req.query.view || 'received').toLowerCase();
  let orders = readOrders().filter(view === 'pending' ? isPendingPaymentOrder : isOrderReceived);
  if (status) orders = orders.filter(o => String(o.status || '').toUpperCase() === status);
  res.json({ ok: true, orders });
});

router.post('/orders/cleanup/preview', (req, res) => {
  const orders = readOrders();
  if (!Array.isArray(orders)) return res.status(500).json({ ok: false, error: 'Order data is not a valid list' });
  const analysis = analyzeOrderCleanup(orders);
  const response = {
    ok: true,
    totalCount: orders.length,
    keepCount: analysis.kept.length,
    removeCount: analysis.removed.length,
    preservedByName: analysis.preservedByName,
    issues: analysis.issues,
    canDelete: analysis.canDelete,
    kept: analysis.kept.map(summarizeCleanupOrder),
    removed: analysis.removed.map(summarizeCleanupOrder)
  };
  if (analysis.canDelete) response.previewToken = createOrderCleanupToken(orders);
  res.json(response);
});

router.post('/orders/cleanup/commit', (req, res) => {
  let backupName = '';
  try {
    const claims = verifyOrderCleanupToken(req.body?.previewToken);
    if (!claims) return res.status(409).json({ ok: false, error: 'Preview expired or invalid. Run the preview again.' });
    const orders = readOrders();
    if (!Array.isArray(orders)) return res.status(500).json({ ok: false, error: 'Order data is not a valid list' });
    if (orderCleanupDigest(orders) !== claims.digest) {
      return res.status(409).json({ ok: false, error: 'Orders changed since the preview. Nothing was deleted; preview again.' });
    }
    const analysis = analyzeOrderCleanup(orders);
    if (!analysis.canDelete) return res.status(409).json({ ok: false, error: 'The original orders no longer match the safe cleanup rule. Nothing was deleted.' });

    const backupDirectory = path.join(config.dataDir, 'backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupName = `orders-before-fake-cleanup-${stamp}-${crypto.randomBytes(4).toString('hex')}.json`;
    const ordersFile = path.join(config.dataDir, 'orders.json');
    const backupPath = path.join(backupDirectory, backupName);
    if (fs.existsSync(ordersFile)) fs.copyFileSync(ordersFile, backupPath, fs.constants.COPYFILE_EXCL);
    else fs.writeFileSync(backupPath, JSON.stringify(orders, null, 2), { flag: 'wx', mode: 0o600 });
    try { fs.chmodSync(backupPath, 0o600); } catch {}

    saveOrders(analysis.kept);
    console.log(JSON.stringify({ event: 'admin.orders.fake_cleanup', keptCount: analysis.kept.length, removedCount: analysis.removed.length, backupName }));
    res.json({ ok: true, keptCount: analysis.kept.length, removedCount: analysis.removed.length, kept: analysis.kept.map(summarizeCleanupOrder), backupName });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Could not remove fake orders', backupName });
  }
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
    if (paymentStatus === 'PAID_ONLINE' && (order.paymentMethod !== 'online' || !['PAID_ONLINE', 'PAID'].includes(String(order.paymentStatus || '').toUpperCase()))) {
      return res.status(409).json({ ok: false, error: 'Online payment can only be marked paid after gateway verification' });
    }
    if (order.paymentMethod === 'online' && ['PAY_ON_DELIVERY', 'PAID_CASH_ON_DELIVERY', 'CANCELLED_NO_CHARGE'].includes(paymentStatus)) {
      return res.status(400).json({ ok: false, error: 'Cash payment statuses are only valid for COD orders' });
    }
    if (paymentStatus === 'REFUNDED' && !['PAID_ONLINE', 'PAID'].includes(String(order.paymentStatus || '').toUpperCase())) {
      return res.status(409).json({ ok: false, error: 'Only a verified paid order can be marked refunded' });
    }
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

const ACTIVE_STATUSES = ['PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY'];

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

/* ============ Morning digest ============ */
router.post('/digest/test', async (req, res) => {
  try {
    const result = await sendMorningDigest({ force: true });
    if (result.ok === false && result.reason === 'smtp_not_configured') {
      return res.status(400).json({ ok: false, error: 'SMTP is not configured in Settings yet' });
    }
    res.json(result);
  } catch (error) {
    console.error(JSON.stringify({ event: 'digest.test.error', error: String(error?.message || error).slice(0, 200) }));
    res.status(500).json({ ok: false, error: 'Could not send digest' });
  }
});

/* ============ COD cash reconciliation ============ */

router.get('/cash', (req, res) => {
  try {
    res.json({ ok: true, summary: cashSummary(String(req.query.date || '').trim() || undefined) });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Could not load cash summary' });
  }
});

router.post('/cash/received', (req, res) => {
  try {
    const summary = recordCashReceived({
      partnerId: req.body?.partnerId,
      amount: req.body?.amount,
      date: req.body?.date,
      note: req.body?.note
    });
    console.error(JSON.stringify({ event: 'cash.received', partnerId: req.body?.partnerId, amount: req.body?.amount }));
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not record cash' });
  }
});

/* ============ Review moderation ============ */

router.get('/reviews', (req, res) => {
  const reviews = loadReviews().slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({ ok: true, reviews });
});

router.post('/reviews/:id/approve', (req, res) => {
  const review = setReviewApproval(req.params.id, req.body?.approved !== false);
  if (!review) return res.status(404).json({ ok: false, error: 'Review not found' });
  res.json({ ok: true, review });
});

router.delete('/reviews/:id', (req, res) => {
  const removed = deleteReview(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Review not found' });
  res.json({ ok: true });
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

/* ---- SMS gateway for OTP sign-in (admin-only; never echoes secrets) ----
   GET  /api/admin/sms        → current provider status
   POST /api/admin/sms        → save/replace config {provider, ...} or {provider:'none'} to disable
   POST /api/admin/sms/test   → dry-run send with UNSAVED credentials {phone, config:{...}} */
import { loadSmsConfig, otpAvailable, sendManagedOtp, sendOtpSms, msg91Balance, verifyWidgetToken, clearMcToken, notifyOrderConfirmed } from '../sms.js';

const SMS_FILE = () => path.join(config.dataDir, 'sms-config.json');

router.get('/sms', (req, res) => {
  const c = loadSmsConfig() || {};
  res.json({
    ok: true, provider: c.provider || null, otpEnabled: otpAvailable(),
    customerId: c.customerId || null, email: c.email || null, sender: c.sender || null,
    hasAuthKey: !!c.authKey, hasPassword: !!c.password
  });
});

router.post('/sms', (req, res) => {
  const b = req.body || {};
  const provider = String(b.provider || '');
  let out = null;
  if (provider === 'none') {
    try { fs.unlinkSync(SMS_FILE()); } catch {}
  } else if (provider === 'dev') {
    out = { provider: 'dev' };
  } else if (provider === 'messagecentral') {
    if (!b.customerId || !b.email || !b.password) return res.status(400).json({ ok: false, error: 'messagecentral needs customerId, email and password.' });
    out = { provider, customerId: String(b.customerId), email: String(b.email), password: String(b.password) };
  } else if (provider === 'msg91') {
    if (!b.authKey) return res.status(400).json({ ok: false, error: 'msg91 needs authKey.' });
    out = { provider, authKey: String(b.authKey) };
    if (b.templateId) out.templateId = String(b.templateId);
  } else if (provider === 'msg91-widget') {
    if (!b.authKey || !b.widgetId || !b.tokenAuth) return res.status(400).json({ ok: false, error: 'msg91-widget needs authKey, widgetId and tokenAuth.' });
    out = { provider, authKey: String(b.authKey), widgetId: String(b.widgetId), tokenAuth: String(b.tokenAuth) };
  } else {
    return res.status(400).json({ ok: false, error: 'provider must be msg91-widget, msg91, messagecentral, dev or none.' });
  }
  if (out) {
    const prev = loadSmsConfig() || {};
    if (prev.whatsapp) out.whatsapp = prev.whatsapp;   // keep WhatsApp config across provider re-saves
    if (prev.orderSms) out.orderSms = prev.orderSms;   // keep SMS flow config too
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(SMS_FILE(), JSON.stringify(out, null, 2));
  }
  clearMcToken();
  console.log(JSON.stringify({ event: 'admin.smsConfig', provider }));
  res.json({ ok: true, provider: provider === 'none' ? null : provider, otpEnabled: provider === 'none' ? false : otpAvailable() });
});

/* ===== WhatsApp order-confirm config (no DLT, no SSH — merge-safe) ===== */
router.get('/whatsapp', (req, res) => {
  const c = loadSmsConfig() || {};
  const wa = c.whatsapp;
  res.json({
    ok: true,
    whatsapp: wa ? {
      integratedNumber: wa.integratedNumber || null,
      templateName: wa.templateName || null,
      language: wa.language || 'en',
      enabled: wa.enabled !== false
    } : null,
    authKeyPresent: Boolean(c.authKey)
  });
});

router.post('/whatsapp', (req, res) => {
  const b = req.body || {};
  const c = loadSmsConfig() || {};
  if (b.clear) {
    delete c.whatsapp;
  } else {
    const integratedNumber = String(b.integratedNumber || '').replace(/\D/g, '');
    const templateName = String(b.templateName || '').trim();
    if (!/^91\d{10}$/.test(integratedNumber)) return res.status(400).json({ ok: false, error: 'integratedNumber must be 91 + 10 digits (the WhatsApp number connected in MSG91).' });
    if (!/^[a-z0-9_]+$/.test(templateName)) return res.status(400).json({ ok: false, error: 'templateName must be lowercase letters/numbers/underscores (Meta template name, e.g. order_confirmed).' });
    if (!c.authKey) return res.status(400).json({ ok: false, error: 'Main MSG91 authKey not set yet (save the SMS provider config first).' });
    c.whatsapp = {
      ...(c.whatsapp || {}),
      integratedNumber,
      templateName,
      ...(b.language ? { language: String(b.language).slice(0, 5) } : {}),
      enabled: b.enabled === false ? false : true
    };
  }
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(SMS_FILE(), JSON.stringify(c, null, 2));
  console.log(JSON.stringify({ event: 'admin.whatsappConfig', cleared: Boolean(b.clear) }));
  res.json({ ok: true, whatsapp: c.whatsapp || null });
});

router.post('/whatsapp/test', async (req, res) => {
  const phone = String((req.body || {}).phone || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
  const c = loadSmsConfig() || {};
  if (!c.whatsapp || !c.whatsapp.integratedNumber || !c.whatsapp.templateName) {
    return res.status(400).json({ ok: false, error: 'WhatsApp not configured yet (need integratedNumber + templateName).' });
  }
  await notifyOrderConfirmed({ id: 'RB-WA-TEST', totalInr: 1, customer: { phone } }, { paid: false });
  res.json({ ok: true, note: 'Test fired to ' + phone + ' — check WhatsApp there. Delivers only if the template is approved and the number is connected in MSG91.' });
});

router.post('/sms/test', async (req, res) => {
  const b = req.body || {};
  const phone = String(b.phone || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' });
  const cfg = b.config && b.config.provider ? b.config : loadSmsConfig();
  if (cfg && cfg.provider === 'msg91-widget') {
    // widget sends happen in the browser via their SDK — server side we can only
    // confirm the verify endpoint accepts the account authkey.
    const probe = await verifyWidgetToken('probe-token-not-real');
    return res.json({ ok: !/AuthenticationFailure|201/i.test(String(probe.error || '')),
      note: probe.error === 'invalid access-token' ? 'Widget verify endpoint reachable and authkey accepted (dummy token correctly rejected).' : 'Verify endpoint says: ' + probe.error });
  }
  if (!cfg || !['messagecentral', 'msg91'].includes(cfg.provider)) {
    return res.status(400).json({ ok: false, error: 'Test supports msg91-widget, messagecentral and msg91 providers (set config.provider).' });
  }
  clearMcToken();
  if (cfg.provider === 'msg91') {
    // Their send API never rejects a bad key, and balance.php can read 0 even when
    // the dashboard shows trial credits — so balance is advisory only. The REAL
    // proof is the code from the SMS arriving on the phone (returned here for comparison).
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const [bal, sent] = await Promise.all([msg91Balance(cfg.authKey), sendOtpSms(phone, code, cfg)]);
    return res.json(sent.ok
      ? { ok: true, sent: true, code, balanceApi: bal.ok ? bal.balance : null,
          note: 'SMS fired to ' + phone + ' with code ' + code + ' — ask the recipient to read it back. If no SMS arrives, key is wrong or wallet empty (dashboard wallet is the truth).' }
      : { ok: false, sent: false, error: sent.error });
  }
  const sent = await sendManagedOtp(phone, cfg);
  res.json(sent.ok
    ? { ok: true, sent: true, note: 'SMS sent — check the phone for the code.' }
    : { ok: false, sent: false, error: sent.error });
});

/* ============ Cashfree payment gateway keys (no SSH needed) ============ */
const CF_FILE = () => path.join(config.dataDir, 'cashfree-config.json');

router.get('/cashfree', (req, res) => {
  const cf = loadCashfreeConfig() || {};
  res.json({ ok: true, mode: cf.mode || null, hasAppId: Boolean(cf.appId), hasSecretKey: Boolean(cf.secretKey), enabled: cashfreeEnabled() });
});

router.post('/cashfree', (req, res) => {
  const b = req.body || {};
  const mode = String(b.mode || '');
  if (mode === 'none') {
    try { fs.unlinkSync(CF_FILE()); } catch {}
    console.log(JSON.stringify({ event: 'admin.cashfreeConfig', mode: null }));
    return res.json({ ok: true, mode: null, enabled: false });
  }
  if (!['test', 'live'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be test, live or none.' });
  if (!b.appId || !b.secretKey) return res.status(400).json({ ok: false, error: 'Cashfree needs both App ID and Secret Key.' });
  const out = { mode, appId: String(b.appId).trim(), secretKey: String(b.secretKey).trim() };
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(CF_FILE(), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ event: 'admin.cashfreeConfig', mode }));
  res.json({ ok: true, mode, enabled: true });
});

router.post('/cashfree/test', async (req, res) => {
  try {
    if (!cashfreeEnabled()) return res.status(400).json({ ok: false, error: 'Save the App ID and Secret Key first.' });
    const probe = await createCashfreePayment({
      id: `RB-CFTEST-${Date.now()}`,
      totalInr: 1,
      customer: { name: 'Cashfree Key Test', phone: '9876543210', email: 'orders@rebestafresh.in' }
    });
    res.json({ ok: true, note: `Keys work — ${probe.mode === 'live' ? 'LIVE' : 'TEST'} order ${probe.cfOrderId} created on Cashfree.`, cfOrderId: probe.cfOrderId, mode: probe.mode });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error?.message || error).slice(0, 300) });
  }
});
