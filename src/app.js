import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config.js';
import { router as publicRouter } from './routes/public.js';
import { router as adminRouter } from './routes/admin.js';
import { publicCatalog } from './lib/store.js';
import { rateLimit } from './lib/rateLimit.js';

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
  <url><loc>${base}/cart</loc></url>
  <url><loc>${base}/track</loc></url>
${productUrls}
</urlset>`);
  });

  app.use('/api/quote', rateLimit({ windowMs: 60_000, max: 90, message: 'Too many delivery-quote attempts. Please wait one minute.' }));
  app.use('/api/orders', rateLimit({ windowMs: 60_000, max: 30, message: 'Too many order requests. Please wait one minute.' }));
  app.use('/api', publicRouter);
  app.use('/api/admin', adminRouter);
  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    index: false,
    maxAge: config.nodeEnv === 'production' ? '10m' : 0
  }));

  app.get('/', (req, res) => res.sendFile('index.html', { root: config.publicDir }));
  app.get(['/cart', '/checkout', '/order-success', '/track', '/admin'], (req, res) => {
    res.sendFile(`${req.path.slice(1)}.html`, { root: config.publicDir });
  });
  app.get('/products/:handle', (req, res) => res.sendFile('product.html', { root: config.publicDir }));

  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'API route not found' }));
  app.use((req, res) => res.redirect('/'));
  app.use((error, req, res, next) => {
    console.error(JSON.stringify({ event: 'store.error', path: req.path, error: String(error?.message || error).slice(0, 500) }));
    if (req.path.startsWith('/api')) {
      return res.status(error.status || 500).json({ ok: false, error: error.status ? error.message : 'Internal server error' });
    }
    res.status(500).type('text/plain').send('Internal server error');
  });
  return app;
}
