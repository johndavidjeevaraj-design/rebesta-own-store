import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config.js';
import { router as publicRouter } from './routes/public.js';
import { router as adminRouter } from './routes/admin.js';
import { router as partnerRouter } from './routes/partner.js';
import { publicCatalog } from './lib/store.js';
import { rateLimit } from './lib/rateLimit.js';
import { startSubscriptionScheduler } from './lib/subscriptions.js';
import { startDigestScheduler } from './lib/digest.js';
import path from 'node:path';
import fs from 'node:fs';

export function createStoreApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(compression());
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '1mb', strict: true }));

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'rebesta-own-store', nodeEnv: config.nodeEnv, now: new Date().toISOString() });
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = config.appUrl;
    const productUrls = publicCatalog().map(p => `  <url><loc>${base}/products/${encodeURIComponent(p.handle)}</loc></url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc></url>
  <url><loc>${base}/about</loc></url>
  <url><loc>${base}/faq</loc></url>
  <url><loc>${base}/partner</loc></url>
  <url><loc>${base}/subscriptions</loc></url>
${productUrls}
</urlset>`);
  });

  app.use('/api/quote', rateLimit({ windowMs: 60_000, max: 90, message: 'Too many delivery-quote attempts. Please wait one minute.' }));
  app.use('/api/orders', rateLimit({ windowMs: 60_000, max: 30, message: 'Too many order requests. Please wait one minute.' }));
  app.use('/api/coupon', rateLimit({ windowMs: 60_000, max: 20, message: 'Too many coupon attempts. Please wait one minute.' }));
  app.use('/api', publicRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/partner', partnerRouter);
  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    index: false,
    maxAge: config.nodeEnv === 'production' ? '10m' : 0
  }));

  app.get('/', (req, res) => res.sendFile('index.html', { root: config.publicDir }));
  app.get(['/cart', '/checkout', '/order-success', '/track', '/about', '/faq', '/terms', '/privacy', '/refund', '/partner', '/subscriptions'], (req, res) => {
    res.sendFile(`${req.path.slice(1)}.html`, { root: config.publicDir });
  });
  app.get('/products/:handle', (req, res) => res.sendFile('product.html', { root: config.publicDir }));

  /* Uploaded images (product photos, delivery proof) — stored in the data dir, outside git */
  const IMAGE_DIRS = { products: 'products', delivery: 'delivery' };
  app.get('/img/:kind/:file', (req, res) => {
    const kind = IMAGE_DIRS[req.params.kind];
    const file = String(req.params.file || '');
    if (!kind || !/^[A-Za-z0-9._-]+$/.test(file) || file.includes('..')) return res.status(404).end();
    const target = path.join(config.dataDir, 'uploads', kind, file);
    if (!fs.existsSync(target)) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=2592000');
    res.sendFile(target);
  });

  /* 🔁 Weekly subscription engine — runs at boot + every 15 minutes */
  startSubscriptionScheduler();
  startDigestScheduler();

  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'API route not found' }));
  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.status(404).sendFile('404.html', { root: config.publicDir });
    }
    res.redirect('/');
  });
  app.use((error, req, res, next) => {
    console.error(JSON.stringify({ event: 'store.error', path: req.path, error: String(error?.message || error).slice(0, 500) }));
    if (req.path.startsWith('/api')) {
      return res.status(error.status || 500).json({ ok: false, error: error.status ? error.message : 'Internal server error' });
    }
    res.status(500).type('text/plain').send('Internal server error');
  });
  return app;
}
