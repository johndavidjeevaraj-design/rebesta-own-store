# Rebesta Fresh — independent store

This project is Rebesta Fresh rebuilt as a self-owned quick-commerce website. It does **not** use Shopify for catalogue, cart, checkout, delivery, payment, or order tracking.

## What is implemented

- 124 sellable fresh-product SKUs imported from the live public Rebesta catalogue.
- All existing variant packs flattened into named SKUs (for example `500 g`, `1 kg`, Small and Large combo).
- Local product images and brand assets.
- Responsive storefront with one header, search, categories and product cards.
- Browser-persisted basket plus a canonical `/cart` page.
- Checkout with:
  - customer details
  - address
  - current GPS pin
  - draggable OpenStreetMap pin
  - manual latitude/longitude fallback
- Server-side route validation so customers cannot alter prices or bypass distance rules.
- OSRM road-distance quote from the Hosur hub at `12.728582, 77.824784`.
- Exact rules:
  - 0–1 km: ₹20
  - 1–3 km: ₹30
  - 3–4 km: ₹40
  - 4–5 km: ₹50
  - 5–6 km: ₹60
  - 6–7 km: ₹70
  - 7–9 km: ₹100
  - free delivery from ₹500 basket value
  - standard eligibility limit: 9 road km
- Tomorrow-morning delivery slots:
  - 7:00 AM – 9:00 AM
  - 9:00 AM – 11:00 AM
- Cash on delivery checkout.
- PayU hosted-checkout request/callback integration, including server-side reverse-hash verification, is coded and unit-tested. The online option stays disabled until live `PAYU_KEY` and `PAYU_SALT` are configured and verified with a real test transaction.
- Order confirmation, masked tracking page and WhatsApp order handover link.
- Owner dashboard at `/admin`:
  - daily order/revenue metrics
  - full order list
  - order-status workflow
  - stock and price updates
  - product visibility
- Automatic stock reservation on order and stock restoration when an order is cancelled.
- Dockerfile and Railway deployment config.

## Start locally

```bash
cd /home/user/rebesta-own-store
npm ci
npm start
```

Local app address: `http://localhost:3000`

Useful routes:

- Storefront: `/`
- Basket: `/cart`
- Checkout: `/checkout`
- Tracking: `/track`
- Admin: `/admin`
- Health: `/health`
- Product API: `/api/products`
- Quote API: `POST /api/quote`

## Tests

```bash
npm test
```

Current tests cover all seven required distance tiers, the ₹500 free-delivery threshold, and the hub-to-sample-pin distance range.

## Production environment variables

Required in production:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_URL=https://rebestafresh.in
ADMIN_KEY=<long-random-private-key>
DATA_DIR=/data
```

Required later for live PayU hosted checkout:

```env
PAYU_KEY=<merchant-key>
PAYU_SALT=<merchant-salt>
PAYU_URL=https://secure.payu.in/_payment
```

Do not commit the admin key or PayU salt.

## Production runbook

Detailed staging, cutover, PayU and backup steps are in [`docs/production-runbook.md`](./docs/production-runbook.md).

## Production persistence warning

The current implementation stores products, settings and orders as JSON under `DATA_DIR`. This is reliable only if the deployed host attaches a persistent disk/volume. Railway and standard VPS deployments can do that.

Recommended managed setup:

1. Create a persistent volume.
2. Mount it at `/data`.
3. Set `DATA_DIR=/data`.
4. Deploy the Dockerfile.
5. Verify `/health` before pointing live users to it.
6. Keep regular off-host backups of `/data/orders.json`, `/data/products.json`, and `/data/settings.json`.

For higher order volume, the next durable upgrade is PostgreSQL with immutable order rows and transaction-safe inventory reservations.

## Catalogue refresh

`scripts/import_public_catalog.py` can rebuild `data/products.json` from the current public storefront without a Shopify admin token:

```bash
python3 scripts/import_public_catalog.py
```

It creates `data/products.previous.json` as a backup. After checkout moves fully away from Shopify, the Admin Dashboard should become the primary catalogue editor instead of re-importing Shopify data.

## Remaining production integrations

These are separate because they require the merchant's private accounts/keys and cannot be completed safely by generating code alone:

1. PayU live merchant keys, success/failure callbacks and settlement verification.
2. WhatsApp Business API or a reliable internal email/SMS alert for staff.
3. PostgreSQL managed database for high availability.
4. Customer login/OTP if repeated customer accounts are required.
5. GoDaddy DNS pointing the live hostname to the chosen host.
6. Final live-domain HTTPS check and a small controlled pilot order wave.

## Core delivery logic files

- `src/lib/delivery.js` — GPS/address geocode plus OSRM driving route.
- `src/lib/store.js` — catalogue, basket validation, inventory and orders.
- `src/routes/public.js` — public products, quote, orders and tracking APIs.
- `src/routes/admin.js` — protected owner APIs.

## Security note

The server recalculates product prices, basket totals, distance and delivery fee. Trusting browser-supplied totals would be unsafe, so those are ignored. The owner dashboard requires `ADMIN_KEY` in production.
