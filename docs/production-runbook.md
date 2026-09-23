# Rebesta Fresh production runbook

This runbook turns the stable self-owned app into the public store.

## 1. Safe staging target

Deploy first to a staging hostname such as:

- `app.rebestafresh.in`
- `new.rebestafresh.in`

Do not point the live root `rebestafresh.in` until smoke tests, admin access, persistence and payment callbacks pass.

## 2. Managed-hosting settings

Use the included `Dockerfile`. Recommended minimum configuration:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_URL=https://app.rebestafresh.in
DATA_DIR=/data
ADMIN_KEY=<generate-a-long-random-key>
```

Attach a persistent volume at `/data`. Without persistence, orders and stock changes disappear when the container is rebuilt.

## 3. First deploy checks

From your local machine or server:

```bash
curl -fsS https://STAGING-HOST/health
python3 scripts/smoke_test.py
# with BASE_URL set externally:
BASE_URL=https://STAGING-HOST python3 scripts/smoke_test.py
```

Expected result:

- near pin: 0.2 road km, ₹20 delivery
- ₹560 cart: ₹0 delivery
- far sample pin: 9.96 road km, `eligible=false`
- no order created

Also verify manually:

1. Homepage loads 124 SKUs.
2. GPS permission works on a phone.
3. Manual pin coordinates work when map tiles are unavailable.
4. COD order appears in `/admin`.
5. Admin status changes, stock cancellation/restock and product edits persist after redeploy/restart.

## 4. DNS cutover

After staging is clean:

1. Prepare Shopify maintenance window or use a short planned notice.
2. Point `rebestafresh.in`/`www.rebestafresh.in` to the new host using the target provided by the host.
3. Wait for HTTPS activation.
4. Set:

```env
APP_URL=https://rebestafresh.in
```

5. Restart/redeploy.
6. Run smoke against `https://rebestafresh.in`.
7. Place one internal COD test order, accept it in `/admin`, and then cancel/refund/reconcile it.
8. Confirm public storefront still shows correct stock after the internal test.

## 5. PayU live activation

Collect only from PayU dashboard/private merchant support:

- merchant key
- merchant salt
- confirm hosted checkout is switched for card/UPI/netbanking
- confirm `surl`/`furl` domains are allowed if PayU requires whitelisting

Set:

```env
PAYU_KEY=<live-key>
PAYU_SALT=<live-salt>
PAYU_URL=https://secure.payu.in/_payment
```

Then perform PayU's smallest allowed test/real transaction. Verify:

- transaction redirects back to `/api/payments/payu/callback`
- reverse hash passes
- order moves from `PENDING_PAYMENT` to `PLACED`
- payment reference appears in `/admin`
- invalid/tampered callback returns 400
- failed payment releases reserved stock

Never store or expose the PayU salt in the repository or browser.

## 6. Staff notifications

The owner dashboard is reliable immediately. For phone alerts, connect WhatsApp Business API (or a transactional email/SMS provider) after production is stable. Do not let the final order flow depend only on a customer clicking a `wa.me` link.

## 7. Backup schedule

For the JSON-file version:

- snapshot `/data/orders.json`, `/data/products.json`, `settings.json` daily
- keep at least 30 daily revisions
- before major catalogue import, backup current files

When order volume rises, migrate to PostgreSQL with point-in-time backups.
