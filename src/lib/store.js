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
  orders: path.join(dataDir, 'orders.json')
};

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
  if (patch.stock !== undefined) {
    const stock = Number(patch.stock);
    if (!Number.isInteger(stock) || stock < 0) throw new Error('Stock must be a non-negative integer');
    p.stock = stock;
  }
  if (patch.active !== undefined) p.active = Boolean(patch.active);
  if (patch.featured !== undefined) p.featured = Boolean(patch.featured);
  saveProducts(products);
  return p;
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
    history: o.history || []
  });
  return Array.isArray(order) ? order.map(clean) : clean(order);
}

export function maskOrders(orders) {
  return orders.map(maskCustomer);
}
