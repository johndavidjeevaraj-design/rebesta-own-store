import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config.js';
import { router as publicRouter } from './routes/public.js';
import { router as adminRouter } from './routes/admin.js';
import { router as partnerRouter } from './routes/partner.js';
import { router as authRouter } from './routes/auth.js';
import supportRouter from './routes/support.js';
import { publicCatalog } from './lib/store.js';
import { rateLimit } from './lib/rateLimit.js';
import { startSubscriptionScheduler } from './lib/subscriptions.js';
import { startDigestScheduler } from './lib/digest.js';
import { startMarketingScheduler, unsubscribeMarketingToken } from './lib/marketing.js';
import path from 'node:path';
import fs from 'node:fs';

export function createStoreApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    /* Content-Security-Policy — allow exactly what the storefront uses:
       self + Cashfree (payments) + MSG91 OTP widget (hcaptcha/recaptcha
       + verify/control endpoints). Next's static export needs inline
       bootstrap scripts/styles. */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'",
          'https://sdk.cashfree.com', 'https://js.cashfree.com',
          'https://verify.msg91.com', 'https://verify.phone91.com', 'https://control.msg91.com', 'https://*.msg91.com',
          'https://js.hcaptcha.com', 'https://hcaptcha.com', 'https://*.hcaptcha.com',
          'https://www.google.com', 'https://www.gstatic.com',
          'https://cdnjs.cloudflare.com', 'https://pass.hostnsoft.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://*.hcaptcha.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        connectSrc: ["'self'",
          'https://api.cashfree.com', 'https://sandbox.cashfree.com', 'https://*.cashfree.com',
          'https://verify.msg91.com', 'https://verify.phone91.com', 'https://control.msg91.com', 'https://*.msg91.com', 'https://api.msg91.com',
          'https://hcaptcha.com', 'https://*.hcaptcha.com', 'https://www.google.com',
          'https://pass.hostnsoft.com', 'https://passbknd.hostnsoft.com',
          'https://api.db-ip.com', 'https://ip-api.com', 'https://ipinfo.io'],
        frameSrc: ['https://sdk.cashfree.com', 'https://js.cashfree.com', 'https://*.cashfree.com',
          'https://verify.msg91.com', 'https://verify.phone91.com', 'https://*.msg91.com',
          'https://hcaptcha.com', 'https://*.hcaptcha.com', 'https://www.google.com'],
        mediaSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: true }
  }));
  /* helmet 8 dropped permissionsPolicy — set it directly.
     camera/mic/payment off; geolocation stays for the delivery pin */
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), gyroscope=(), accelerometer=(), geolocation=(self)');
    next();
  });
  app.use(compression());
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '1mb', strict: true }));

  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'rebesta-own-store', nodeEnv: config.nodeEnv, now: new Date().toISOString() });
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = config.appUrl;
    const LASTMOD = '<lastmod>2026-10-07</lastmod>'; // brand/favicon + schema refresh — all pages changed
    const pageUrls = ['', '/about', '/faq', '/partner', '/subscriptions', '/shop', '/track', '/login']
      .map(u => `  <url><loc>${base}${u}</loc>${LASTMOD}</url>`).join('\n');
    const productUrls = publicCatalog().map(p => `  <url><loc>${base}/products/${encodeURIComponent(p.handle)}</loc>${LASTMOD}</url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pageUrls}
${productUrls}
</urlset>`);
  });

  app.use('/api/quote', rateLimit({ windowMs: 60_000, max: 90, message: 'Too many delivery-quote attempts. Please wait one minute.' }));
  app.use('/api/orders', rateLimit({ windowMs: 60_000, max: 30, message: 'Too many order requests. Please wait one minute.' }));
  app.use('/api/coupon', rateLimit({ windowMs: 60_000, max: 20, message: 'Too many coupon attempts. Please wait one minute.' }));
  app.use('/api/support', rateLimit({ windowMs: 60_000, max: 20, message: 'You are chatting too fast — give the assistant a moment!' }));
  app.use('/api/marketing', rateLimit({ windowMs: 60_000, max: 20, message: 'Too many marketing preference changes. Please wait a moment.' }));
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/partner', partnerRouter);

  /* A signed, one-purpose link from each marketing message lets a recipient
     confirm opt-out without exposing their phone number or creating an account. */
  app.get('/unsubscribe', (req, res) => {
    const token = String(req.query.token || '').slice(0, 2048);
    if (!/^[A-Za-z0-9._-]+$/.test(token)) {
      return res.status(400).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="margin:0;background:#fff8f3;font:16px system-ui;color:#24211f"><main style="max-width:480px;margin:12vh auto;padding:28px"><h1>Invalid unsubscribe link</h1><p>Please use the link in your Rebesta Fresh WhatsApp message.</p></main></body></html>');
    }
    res.set('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marketing preferences</title><body style="margin:0;background:#fff8f3;font:16px system-ui;color:#24211f"><main style="max-width:480px;margin:10vh auto;padding:28px;background:white;border:1px solid #f0dfd4;border-radius:20px"><h1 style="color:#e95b22">Stop daily marketing messages?</h1><p>Confirm to stop Rebesta Fresh daily WhatsApp marketing messages. Order and delivery updates are managed separately.</p><form method="post" action="/unsubscribe"><input type="hidden" name="token" value="${token}"><button style="border:0;border-radius:999px;background:#ff5b20;color:white;padding:13px 22px;font-weight:700;font-size:15px">Unsubscribe</button></form></main></body></html>`);
  });
  app.post('/unsubscribe', (req, res) => {
    const result = unsubscribeMarketingToken(req.body?.token);
    res.set('Cache-Control', 'no-store');
    if (!result.ok) return res.status(400).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="margin:0;background:#fff8f3;font:16px system-ui;color:#24211f"><main style="max-width:480px;margin:12vh auto;padding:28px"><h1>Link not recognized</h1><p>This unsubscribe link could not be verified. Please contact Rebesta Fresh for help.</p></main></body></html>');
    res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="margin:0;background:#fff8f3;font:16px system-ui;color:#24211f"><main style="max-width:480px;margin:12vh auto;padding:28px;background:white;border:1px solid #f0dfd4;border-radius:20px"><h1 style="color:#e95b22">You’re unsubscribed</h1><p>You will no longer receive daily Rebesta Fresh WhatsApp marketing messages.</p></main></body></html>');
  });

  /* checkout page retired 2026-10-07 — /cart is the one-page checkout now */
  app.get(['/checkout', '/checkout.html'], (req, res) => res.redirect(302, '/cart'));

  /* v3 (Next export) pages — MUST be registered before express.static, which
     otherwise wins with the legacy public/<page>.html files */
  app.get('/', (req, res) => res.sendFile('v2/index.html', { root: config.publicDir }));
  app.get(['/shop', '/offers', '/greens'], (req, res) => res.sendFile(`v2${req.path}.html`, { root: config.publicDir }));
  app.get(['/about', '/faq', '/terms', '/privacy', '/refund'], (req, res) => res.sendFile(`v2${req.path}.html`, { root: config.publicDir }));
  app.get('/cart', (req, res) => res.sendFile('v2/cart.html', { root: config.publicDir }));

  /* v3 islands for these too — fall back to the previous page if this build
     somehow lacks the export, so the route can never 404 after a deploy */
  const v3WithFallback = (page) => (req, res) => {
    res.sendFile(`v2/${page}.html`, { root: config.publicDir }, (err) => {
      if (err) res.sendFile(`${page}.html`, { root: config.publicDir });
    });
  };
  app.get('/admin', v3WithFallback('admin'));
  app.get('/login', v3WithFallback('login'));
  app.get('/account', v3WithFallback('account'));
  app.get('/order-success', v3WithFallback('order-success'));
  app.get('/track', v3WithFallback('track'));
  app.get('/subscriptions', v3WithFallback('subscriptions'));
  app.get('/partner', v3WithFallback('partner'));

  /* the service worker must NEVER sit in an HTTP cache — a browser that
     can't fetch fresh sw.js bytes never updates or retires a stale worker,
     and returning visitors can get stuck on an old app shell */
  app.get(['/sw.js', '/manifest.json'], (req, res) => {
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.sendFile(req.path.slice(1), { root: config.publicDir });
  });

  /* v1 admin/store scripts: always revalidate — the owner must see admin-panel
     fixes the moment they deploy, not after a 10-minute browser cache */
  app.get(['/js/admin.js', '/js/auth.js', '/js/store.js', '/js/partner.js'], (req, res) => {
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.sendFile(req.path.slice(1), { root: config.publicDir });
  });

  /* speed: content-hashed Next assets cache forever; images cache a week */
  app.use('/v2/_next/static', express.static(path.join(config.publicDir, 'v2/_next/static'), { maxAge: '365d', immutable: true }));
  app.use('/assets', express.static(path.join(config.publicDir, 'assets'), { maxAge: '7d' }));

  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    index: false,
    maxAge: config.nodeEnv === 'production' ? '10m' : 0
  }));
  /* one auth page: number + OTP decides sign-in vs new account — /signup is legacy */
  app.get('/signup', (req, res) => res.redirect(302, '/login' + (req.query.phone ? `?phone=${encodeURIComponent(String(req.query.phone))}` : '')));
  /* product pages: serve their static Next export when available; otherwise
     use the Next-built live-data shell for products added after the last build.
     Keep the Vite page as a final rollback fallback until the Next shell is
     verified in production. */
  app.get('/products/:handle', (req, res) => {
    const handle = String(req.params.handle || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (!handle) return res.status(404).sendFile('404.html', { root: config.publicDir });
    res.sendFile(`v2/products/${handle}.html`, { root: config.publicDir }, (err) => {
      if (!err) return;
      res.sendFile('v2/product-fallback.html', { root: config.publicDir }, (fallbackError) => {
        if (fallbackError) res.sendFile('product.html', { root: config.publicDir });
      });
    });
  });

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
  startMarketingScheduler();

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
