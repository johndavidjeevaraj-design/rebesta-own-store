import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const dataDir = config.dataDir;
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'orders'), { recursive: true });

const files = {
  products: path.join(dataDir, 'products.json'),
  settings: path.join(dataDir, 'settings.json'),
  orders: path.join(dataDir, 'orders.json'),
  partners: path.join(dataDir, 'partners.json'),
  positions: path.join(dataDir, 'partner-positions.json'),
  subscriptions: path.join(dataDir, 'subscriptions.json'),
  reviews: path.join(dataDir, 'reviews.json'),
  cashLog: path.join(dataDir, 'cash-log.json')
};

const randomSku = () => crypto.randomBytes(4).toString('hex');

/* India/Kolkata calendar day (YYYY-MM-DD) for an ISO timestamp */
export function istDay(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '';
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

export function loadProducts() {
  return readJson(files.products, []).map(p => ({ ...p, stock: Number(p.stock || 0), priceInr: Number(p.priceInr || 0) }));
}

export function saveProducts(products) {
  writeJson(files.products, products);
  return products;
}

export function loadSettings() {
  return readJson(files.settings, {});
}

export function saveSettings(settings) {
  writeJson(files.settings, settings);
  return settings;
}

export function publicCatalog({ includeInactive = false } = {}) {
  return loadProducts()
    .filter(p => includeInactive || p.active)
    .map(p => ({
      handle: p.handle,
      baseHandle: p.baseHandle || p.handle,
      variantTitle: p.variantTitle || '',
      title: p.title,
      description: p.description,
      vendor: p.vendor,
      category: p.category,
      tags: p.tags || [],
      sku: p.sku,
      priceInr: p.priceInr,
      compareAtInr: p.compareAtInr || null,
      image: p.image,
      unitLabel: p.unitLabel || '1 kg',
      weightGrams: p.weightGrams || 1000,
      stock: p.stock,
      featured: Boolean(p.featured)
    }));
}

export function getProduct(handle) {
  return loadProducts().find(p => p.handle === String(handle || '').trim());
}

export function updateProduct(handle, patch) {
  const products = loadProducts();
  const p = products.find(p => p.handle === handle);
  if (!p) return null;
  if (patch.priceInr !== undefined) {
    const price = Number(patch.priceInr);
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid price');
    p.priceInr = Math.round(price * 100) / 100;
  }
  if (patch.compareAtInr !== undefined) {
    const compare = Number(patch.compareAtInr);
    if (!Number.isFinite(compare) || compare < 0) throw new Error('Invalid compare-at price');
    p.compareAtInr = compare > 0 ? Math.round(compare * 100) / 100 : null;
  }
  if (patch.stock !== undefined) {
    const stock = Number(patch.stock);
    if (!Number.isInteger(stock) || stock < 0) throw new Error('Stock must be a non-negative integer');
    p.stock = stock;
  }
  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim().slice(0, 100);
    if (title.length < 2) throw new Error('Title must be at least 2 characters');
    p.title = title;
  }
  if (patch.description !== undefined) p.description = String(patch.description || '').trim().slice(0, 1500);
  if (patch.category !== undefined) p.category = String(patch.category || 'Seasonal').trim().slice(0, 60) || 'Seasonal';
  if (patch.unitLabel !== undefined) p.unitLabel = String(patch.unitLabel || '1 kg').trim().slice(0, 30) || '1 kg';
  if (patch.active !== undefined) p.active = Boolean(patch.active);
  if (patch.featured !== undefined) p.featured = Boolean(patch.featured);
  if (patch.image !== undefined) {
    const image = String(patch.image || '').trim();
    if (image && !/^\/[A-Za-z0-9._\-\/]+$/.test(image)) throw new Error('Image path must be a site-relative URL');
    p.image = image.slice(0, 300);
  }
  saveProducts(products);
  return p;
}

/* Shop-owner product creation — no code, no CSV, straight from the admin dashboard */
export function createProduct(payload = {}) {
  const title = String(payload.title || '').trim().slice(0, 100);
  if (title.length < 2) throw Object.assign(new Error('Enter a product title'), { status: 400 });
  const priceInr = Number(payload.priceInr);
  if (!Number.isFinite(priceInr) || priceInr < 0 || priceInr > 100000) throw Object.assign(new Error('Enter a valid price'), { status: 400 });
  const stock = Number(payload.stock);
  if (!Number.isInteger(stock) || stock < 0) throw Object.assign(new Error('Stock must be a whole number, 0 or more'), { status: 400 });
  const compareRaw = Number(payload.compareAtInr);
  const compareAtInr = Number.isFinite(compareRaw) && compareRaw > priceInr ? Math.round(compareRaw * 100) / 100 : null;

  const products = loadProducts();
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'product';
  let handle = base;
  let suffix = 2;
  while (products.some(p => p.handle === handle)) handle = `${base}-${suffix++}`;

  const product = {
    handle,
    baseHandle: handle,
    variantTitle: '',
    title,
    description: String(payload.description || '').trim().slice(0, 1500),
    vendor: 'Rebesta Fresh',
    category: String(payload.category || 'Seasonal').trim().slice(0, 60) || 'Seasonal',
    tags: [],
    sku: `VEG-AD-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    priceInr: Math.round(priceInr * 100) / 100,
    compareAtInr,
    image: String(payload.image || '/assets/brand/basket.jpg').slice(0, 300),
    unitLabel: String(payload.unitLabel || '1 kg').trim().slice(0, 30) || '1 kg',
    weightGrams: 1000,
    stock,
    featured: Boolean(payload.featured),
    active: true,
    createdAt: new Date().toISOString()
  };
  products.unshift(product);
  saveProducts(products);
  return product;
}

export function buildCart(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw Object.assign(new Error('Your basket is empty'), { status: 400 });
  const byHandle = new Map(loadProducts().map(p => [p.handle, p]));
  const lines = [];
  for (const raw of rawItems) {
    const handle = String(raw.handle || '').trim();
    const qty = Number(raw.qty);
    const p = byHandle.get(handle);
    if (!p || !p.active) throw Object.assign(new Error(`Product unavailable: ${handle || 'unknown'}`), { status: 400 });
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw Object.assign(new Error(`Invalid quantity for ${p.title}`), { status: 400 });
    if (p.stock < qty) throw Object.assign(new Error(`${p.title}: only ${p.stock} ${p.unitLabel} available`), { status: 400 });
    lines.push({
      handle: p.handle,
      sku: p.sku,
      title: p.title,
      category: p.category,
      unitLabel: p.unitLabel,
      image: p.image,
      qty,
      priceInr: p.priceInr,
      lineTotalInr: Math.round(p.priceInr * qty * 100) / 100
    });
  }
  const subtotalInr = lines.reduce((s, line) => s + line.lineTotalInr, 0);
  return { lines, subtotalInr: Math.round(subtotalInr * 100) / 100 };
}

export function readOrders() {
  return readJson(files.orders, []);
}

export function saveOrders(orders) {
  writeJson(files.orders, orders);
  return orders;
}

export function loadPartners() {
  return readJson(files.partners, []);
}

export function savePartners(partners) {
  writeJson(files.partners, partners);
  return partners;
}

export function loadPositions() {
  return readJson(files.positions, {});
}

export function savePositions(positions) {
  writeJson(files.positions, positions);
  return positions;
}

/* --- Weekly subscriptions --- */
export function loadSubscriptions() {
  return readJson(files.subscriptions, []);
}

export function saveSubscriptions(subscriptions) {
  writeJson(files.subscriptions, subscriptions);
  return subscriptions;
}

/* --- Customer reviews (moderated) --- */

export function loadReviews() {
  return readJson(files.reviews, []);
}

export function saveReviews(reviews) {
  writeJson(files.reviews, reviews);
  return reviews;
}

export function reviewForOrder(orderId) {
  return loadReviews().find(r => r.orderId === String(orderId || '').toUpperCase()) || null;
}

export function addCustomerReview({ orderId, rating, text }) {
  const reviews = loadReviews();
  const id = String(orderId || '').trim().toUpperCase();
  const order = getOrder(id);
  if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }
  if (order.status !== 'DELIVERED') { const e = new Error('You can review after the order is delivered'); e.status = 409; throw e; }
  if (reviews.some(r => r.orderId === id)) { const e = new Error('This order already has a review'); e.status = 409; throw e; }
  const stars = Math.round(Number(rating));
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) { const e = new Error('Rating must be 1–5 stars'); e.status = 400; throw e; }
  const nameRaw = String(order.customer?.name || 'Customer').trim();
  const parts = nameRaw.split(/\s+/);
  const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  const review = {
    id: `REV-${randomSku()}`,
    orderId: id,
    productHandles: (order.items || []).map(i => i.handle).filter(Boolean),
    name: displayName,
    rating: stars,
    text: String(text || '').trim().slice(0, 400),
    approved: false,
    createdAt: new Date().toISOString()
  };
  reviews.push(review);
  saveReviews(reviews);
  return review;
}

export function setReviewApproval(id, approved) {
  const reviews = loadReviews();
  const review = reviews.find(r => r.id === id);
  if (!review) return null;
  review.approved = Boolean(approved);
  saveReviews(reviews);
  return review;
}

export function deleteReview(id) {
  const reviews = loadReviews();
  const next = reviews.filter(r => r.id !== id);
  if (next.length === reviews.length) return false;
  saveReviews(next);
  return true;
}

export function approvedReviewsForProduct(handle) {
  return loadReviews()
    .filter(r => r.approved && (r.productHandles || []).includes(handle))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 12)
    .map(r => ({ name: r.name, rating: r.rating, text: r.text, createdAt: r.createdAt }));
}

/* --- COD cash reconciliation --- */

export function loadCashLog() {
  return readJson(files.cashLog, []);
}

function deliveredAtOf(order) {
  const entry = (order.history || []).find(h => h.status === 'DELIVERED');
  return entry?.at || order.updatedAt || order.placedAt || '';
}

export function cashSummary(dateIso) {
  const day = dateIso || istDay(new Date().toISOString());
  const partners = loadPartners();
  const rows = partners.map(p => ({ partnerId: p.id, name: p.name, active: p.active !== false, orderCount: 0, collectedInr: 0, receivedInr: 0 }));
  const byPartner = new Map(rows.map(r => [r.partnerId, r]));
  const ordersToday = [];
  for (const o of readOrders()) {
    if (o.paymentMethod !== 'cod' || o.status !== 'DELIVERED' || !o.assignedPartnerId) continue;
    if (istDay(deliveredAtOf(o)) !== day) continue;
    const row = byPartner.get(o.assignedPartnerId);
    if (!row) continue;
    row.orderCount += 1;
    row.collectedInr += Number(o.totalInr) || 0;
    ordersToday.push({ id: o.id, partnerId: o.assignedPartnerId, partnerName: o.assignedPartnerName, totalInr: o.totalInr });
  }
  for (const h of loadCashLog()) {
    if (h.date !== day) continue;
    const row = byPartner.get(h.partnerId);
    if (row) row.receivedInr += Number(h.amount) || 0;
  }
  for (const row of rows) row.pendingInr = Math.max(0, row.collectedInr - row.receivedInr);
  return {
    date: day,
    partners: rows,
    orders: ordersToday,
    totals: {
      collectedInr: rows.reduce((s, r) => s + r.collectedInr, 0),
      receivedInr: rows.reduce((s, r) => s + r.receivedInr, 0),
      pendingInr: rows.reduce((s, r) => s + r.pendingInr, 0)
    }
  };
}

export function recordCashReceived({ partnerId, amount, date, note }) {
  const partner = loadPartners().find(p => p.id === partnerId);
  if (!partner) { const e = new Error('Partner not found'); e.status = 404; throw e; }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) { const e = new Error('Enter a valid amount'); e.status = 400; throw e; }
  const log = loadCashLog();
  log.push({
    id: `CASH-${randomSku()}`,
    partnerId,
    partnerName: partner.name,
    amount: Math.round(value * 100) / 100,
    date: date || istDay(new Date().toISOString()),
    note: String(note || '').slice(0, 120),
    receivedAt: new Date().toISOString()
  });
  writeJson(files.cashLog, log);
  return cashSummary(date);
}

export function getSubscription(id) {
  return loadSubscriptions().find(s => s.id === String(id || '').trim().toUpperCase());
}

/* Slot capacity: count live orders per slot for a delivery date (IST) */
export function slotUsageFor(dateIso) {
  const day = String(dateIso || '').slice(0, 10);
  const counts = {};
  for (const order of readOrders()) {
    if (order.status === 'CANCELLED' || order.status === 'PAYMENT_FAILED') continue;
    if (String(order.deliveryDate?.iso || '').slice(0, 10) !== day) continue;
    const slotId = order.slot?.id;
    if (slotId) counts[slotId] = (counts[slotId] || 0) + 1;
  }
  return counts;
}

export function slotCapacity() {
  const value = Number(loadSettings().delivery?.slotCapacity);
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : 25;
}

export function addOrder(order) {
  const id = `RB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const isOnline = order.paymentMethod === 'online';
  const fullOrder = {
    id,
    status: isOnline ? 'PENDING_PAYMENT' : 'PLACED',
    paymentStatus: isOnline ? 'PENDING' : 'PAY_ON_DELIVERY',
    placedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [{ status: isOnline ? 'PENDING_PAYMENT' : 'PLACED', at: new Date().toISOString(), note: isOnline ? 'Awaiting PayU payment' : 'Order received' }],
    ...order
  };
  const orders = readOrders();
  orders.unshift(fullOrder);

  // Immediate inventory reservation for a local quick-commerce operation.
  const products = loadProducts();
  for (const line of fullOrder.items) {
    const p = products.find(product => product.handle === line.handle);
    if (!p || p.stock < line.qty) throw Object.assign(new Error(`${line.title}: stock changed, please retry`), { status: 409 });
  }
  for (const line of fullOrder.items) {
    const p = products.find(product => product.handle === line.handle);
    p.stock -= line.qty;
  }
  saveProducts(products);
  saveOrders(orders);
  return fullOrder;
}

export function getOrder(id) {
  return readOrders().find(o => o.id === String(id || '').trim().toUpperCase());
}

export function updateOrderStatus(id, status, note = '') {
  const allowed = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'PAYMENT_FAILED', 'PAID_NEEDS_REVIEW'];
  if (!allowed.includes(status)) throw Object.assign(new Error('Invalid order status'), { status: 400 });
  const orders = readOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;

  const products = loadProducts();
  const adjustStock = direction => {
    for (const line of order.items || []) {
      const product = products.find(p => p.handle === line.handle);
      if (!product) throw Object.assign(new Error(`Product not found while updating stock: ${line.handle}`), { status: 409 });
      if (direction === -1 && product.stock < line.qty) throw Object.assign(new Error(`${product.title}: not enough stock to reactivate this order`), { status: 409 });
    }
    for (const line of order.items || []) {
      const product = products.find(p => p.handle === line.handle);
      product.stock += (line.qty * direction);
    }
    saveProducts(products);
  };

  if (status === 'CANCELLED' && order.status !== 'CANCELLED') adjustStock(1);
  if (status !== 'CANCELLED' && order.status === 'CANCELLED') adjustStock(-1);

  order.status = status;
  if (status === 'DELIVERED' && order.paymentMethod === 'cod') order.paymentStatus = 'PAID_CASH_ON_DELIVERY';
  if (status === 'CANCELLED' && order.paymentMethod === 'cod') order.paymentStatus = 'CANCELLED_NO_CHARGE';
  order.updatedAt = new Date().toISOString();
  order.history.push({ status, at: order.updatedAt, note });
  saveOrders(orders);
  return order;
}

export function markPayuPayment(id, { success, reference, mode, raw }) {
  const orders = readOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  if (order.paymentStatus === 'PAID_ONLINE') return order;

  const products = loadProducts();
  order.updatedAt = new Date().toISOString();
  if (success) {
    order.paymentStatus = 'PAID_ONLINE';
    order.paidAt = new Date().toISOString();
    order.paymentReference = reference || '';
    order.paymentMode = mode || '';
    order.status = order.status === 'PENDING_PAYMENT' ? 'PLACED' : order.status;
    if (order.status === 'CANCELLED') {
      order.status = 'PAID_NEEDS_REVIEW';
      order.history.push({ status: 'PAID_NEEDS_REVIEW', at: order.updatedAt, note: 'Paid after an earlier cancellation; reconcile stock/refund manually' });
    } else {
      order.history.push({ status: 'PLACED', at: new Date().toISOString(), note: 'PayU payment verified' });
    }
  } else {
    order.paymentStatus = 'FAILED';
    order.paymentReference = reference || '';
    order.paymentMode = mode || '';
    if (order.status === 'PENDING_PAYMENT' || order.status === 'PLACED') {
      for (const line of order.items || []) {
        const product = products.find(p => p.handle === line.handle);
        if (!product) throw Object.assign(new Error(`Product not found while restoring stock: ${line.handle}`), { status: 409 });
        product.stock += line.qty;
      }
      saveProducts(products);
      order.status = 'PAYMENT_FAILED';
      order.history.push({ status: 'PAYMENT_FAILED', at: new Date().toISOString(), note: 'PayU payment failed/cancelled; reserved stock released' });
    }
  }
  order.paymentGatewayResponse = raw ? JSON.stringify(raw).slice(0, 12000) : '';
  saveOrders(orders);
  return order;
}

export function maskCustomer(order) {
  const clean = o => ({
    id: o.id,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    placedAt: o.placedAt,
    updatedAt: o.updatedAt,
    items: o.items,
    subtotalInr: o.subtotalInr,
    discountInr: o.discountInr || 0,
    couponCode: o.couponCode || '',
    deliveryFeeInr: o.deliveryFeeInr,
    totalInr: o.totalInr,
    distanceKm: o.distanceKm,
    tierLabel: o.deliveryTierLabel,
    deliveryDate: o.deliveryDate,
    slot: o.slot,
    customer: {
      name: o.customer?.name || '',
      phone: o.customer?.phone ? `******${String(o.customer.phone).slice(-4)}` : ''
    },
    address: {
      city: o.address?.city || '',
      pincode: o.address?.pincode || '',
      area: o.address?.area || ''
    },
    history: o.history || [],
    deliveryPhoto: o.deliveryPhoto || '',
    reviewed: o.status === 'DELIVERED' ? Boolean(reviewForOrder(o.id)) : false
  });
  return Array.isArray(order) ? order.map(clean) : clean(order);
}

export function maskOrders(orders) {
  return orders.map(maskCustomer);
}

export function findCoupon(code) {
  const wanted = String(code || '').trim().toUpperCase();
  if (!wanted) return null;
  const settings = loadSettings();
  const coupon = (settings.promotions?.coupons || []).find(c => String(c.code || '').trim().toUpperCase() === wanted && c.active !== false);
  if (!coupon) return null;
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) return null;
  if (coupon.maxUses && Number(coupon.usedCount || 0) >= Number(coupon.maxUses)) return null;
  return { ...coupon };
}

export function markCouponUsed(code) {
  const settings = loadSettings();
  const coupon = (settings.promotions?.coupons || []).find(c => String(c.code || '').trim().toUpperCase() === String(code || '').trim().toUpperCase());
  if (coupon) {
    coupon.usedCount = Number(coupon.usedCount || 0) + 1;
    saveSettings(settings);
  }
}

export function addCoupon(coupon) {
  const settings = loadSettings();
  if (!settings.promotions) settings.promotions = {};
  if (!Array.isArray(settings.promotions.coupons)) settings.promotions.coupons = [];
  settings.promotions.coupons.unshift(coupon);
  saveSettings(settings);
  return coupon;
}

function randomCode(len = 6) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

/* Loyalty: when an order is DELIVERED the customer earns a single-use reward coupon. */
export function awardLoyalty(order) {
  const settings = loadSettings();
  const loyalty = settings.promotions?.loyalty;
  if (!loyalty?.enabled || order.loyaltyCouponCode) return null;
  const value = Math.min(500, Math.max(10, Math.round(Number(order.subtotalInr || 0) * Number(loyalty.percent || 2) / 100)));
  const coupon = {
    code: `LOY-${randomCode()}`,
    type: 'flat',
    value,
    minOrderInr: Number(loyalty.minOrderInr || 299),
    active: true,
    maxUses: 1,
    usedCount: 0,
    expiresAt: new Date(Date.now() + Number(loyalty.validityDays || 60) * 86400000).toISOString(),
    note: `Loyalty reward for ${order.id}`
  };
  addCoupon(coupon);
  const orders = readOrders();
  const fresh = orders.find(o => o.id === order.id);
  if (fresh) {
    fresh.loyaltyCouponCode = coupon.code;
    fresh.loyaltyCouponValue = value;
    saveOrders(orders);
    order.loyaltyCouponCode = coupon.code;
    order.loyaltyCouponValue = value;
  }
  return coupon;
}

/* Referral: when a referred customer's first order is DELIVERED, both sides earn a coupon. */
export function awardReferral(order) {
  const settings = loadSettings();
  const referral = settings.promotions?.referral;
  if (!referral?.enabled || order.referralRewarded || !order.referredBy) return null;
  const orders = readOrders();
  const fresh = orders.find(o => o.id === order.id);
  if (!fresh) return null;
  const referrerHasDelivery = orders.some(o => o.customer?.phone === fresh.referredBy && o.status === 'DELIVERED' && o.id !== fresh.id);
  const referredHasPrior = orders.some(o => o.customer?.phone === fresh.customer?.phone && o.placedAt < fresh.placedAt && o.id !== fresh.id);
  if (!referrerHasDelivery || referredHasPrior) return null;
  const bonus = Math.min(500, Math.max(10, Number(referral.bonusInr || 50)));
  const expiry = new Date(Date.now() + 60 * 86400000).toISOString();
  const friendCoupon = { code: `REF-${randomCode()}`, type: 'flat', value: bonus, minOrderInr: 299, active: true, maxUses: 1, usedCount: 0, expiresAt: expiry, note: `Referral thank-you for ${order.id}` };
  const referrerCoupon = { code: `REF-${randomCode()}`, type: 'flat', value: bonus, minOrderInr: 299, active: true, maxUses: 1, usedCount: 0, expiresAt: expiry, note: `Referral bonus for referring ${order.id}` };
  addCoupon(friendCoupon);
  addCoupon(referrerCoupon);
  fresh.referralRewarded = true;
  fresh.referralCouponCode = friendCoupon.code;
  fresh.referrerCouponCode = referrerCoupon.code;
  saveOrders(orders);
  order.referralRewarded = true;
  order.referralCouponCode = friendCoupon.code;
  order.referrerCouponCode = referrerCoupon.code;
  return { friendCoupon, referrerCoupon };
}

/* Public order history by phone — light shape, no addresses. */
export function ordersByPhone(phone) {
  const wanted = String(phone || '').replace(/[^0-9]/g, '').slice(-10);
  if (wanted.length !== 10) return [];
  const cancellable = ['PENDING_PAYMENT', 'PLACED', 'CONFIRMED'];
  return readOrders()
    .filter(o => String(o.customer?.phone || '').replace(/[^0-9]/g, '').endsWith(wanted))
    .map(o => ({
      id: o.id,
      status: o.status,
      placedAt: o.placedAt,
      deliveryDate: o.deliveryDate,
      slot: o.slot ? { id: o.slot.id, label: o.slot.label } : null,
      totalInr: o.totalInr,
      itemCount: (o.items || []).reduce((sum, line) => sum + Number(line.qty || 0), 0),
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      loyaltyCouponCode: o.loyaltyCouponCode || '',
      loyaltyCouponValue: o.loyaltyCouponValue || 0,
      referralCouponCode: o.referralCouponCode || '',
      cancellable: cancellable.includes(o.status) && o.paymentMethod === 'cod'
    }));
}

/* Customer self-cancellation (COD orders before packing starts). */
export function cancelOrderPublic(id, phone) {
  const wanted = String(phone || '').replace(/[^0-9]/g, '').slice(-10);
  if (wanted.length !== 10) throw Object.assign(new Error('Enter the phone number used on the order'), { status: 400 });
  const order = getOrder(id);
  if (!order) return null;
  if (!String(order.customer?.phone || '').replace(/[^0-9]/g, '').endsWith(wanted)) {
    throw Object.assign(new Error('Phone number does not match this order'), { status: 403 });
  }
  if (!['PENDING_PAYMENT', 'PLACED', 'CONFIRMED'].includes(order.status)) {
    throw Object.assign(new Error('This order can no longer be cancelled online — it is already being prepared. WhatsApp us and we will help.'), { status: 409 });
  }
  return updateOrderStatus(id, 'CANCELLED', 'Cancelled by customer');
}

/* --- Cheap change-detection versions for live polling (no full reads) --- */
export function dataVersions() {
  const mtime = file => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };
  return {
    orders: `${readOrders().length}:${mtime(files.orders)}`,
    products: `${loadProducts().length}:${mtime(files.products)}`,
    settings: `${mtime(files.settings)}`,
    partners: `${loadPartners().length}:${mtime(files.partners)}`,
    positions: `${mtime(files.positions)}`,
    subscriptions: `${loadSubscriptions().length}:${mtime(files.subscriptions)}`
  };
}

/* --- Backups: snapshot of all JSON data --- */
export function createBackup() {
  return {
    createdAt: new Date().toISOString(),
    files: {
      products: readJson(files.products, []),
      orders: readJson(files.orders, []),
      settings: readJson(files.settings, {}),
      partners: readJson(files.partners, []),
      positions: readJson(files.positions, {}),
      subscriptions: readJson(files.subscriptions, [])
    }
  };
}

export function writeAutoBackup() {
  try {
    const dir = path.join(dataDir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const target = path.join(dir, `backup-${stamp}.json`);
    fs.writeFileSync(target, JSON.stringify(createBackup(), null, 2));
    const all = fs.readdirSync(dir).filter(f => f.startsWith('backup-') && f.endsWith('.json')).sort();
    while (all.length > 14) fs.unlinkSync(path.join(dir, all.shift()));
    console.log(JSON.stringify({ event: 'backup.written', target }));
    return target;
  } catch (error) {
    console.error(JSON.stringify({ event: 'backup.error', error: String(error?.message || error).slice(0, 200) }));
    return null;
  }
}

export function couponDiscount(coupon, subtotalInr) {
  if (!coupon) return 0;
  const subtotal = Number(subtotalInr || 0);
  if (subtotal < Number(coupon.minOrderInr || 0)) return 0;
  const raw = coupon.type === 'percent' ? subtotal * Number(coupon.value || 0) / 100 : Number(coupon.value || 0);
  return Math.max(0, Math.min(Math.round(raw), Math.round(subtotal)));
}
