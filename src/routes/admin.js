import express from 'express';
import { config } from '../config.js';
import { loadProducts, loadSettings, readOrders, updateOrderStatus, updateProduct, saveSettings } from '../lib/store.js';

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
  res.json({ ok: true, settings });
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
      for (const key of ['name', 'whatsapp', 'phoneDisplay', 'city']) {
        if (patch.business[key] !== undefined) current[key] = String(patch.business[key]).trim();
      }
    }
    if (patch.promotions) {
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
          return { code, type, value, minOrderInr, active: c.active !== false };
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
    res.json({ ok: true, order });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not update order' });
  }
});
