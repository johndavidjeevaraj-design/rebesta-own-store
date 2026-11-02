# Rebesta Fresh — Independent Quick-Commerce Store

A self-owned vegetable commerce platform for Rebesta Fresh, built to support a local fresh-produce delivery operation. The application owns its catalogue, basket, delivery quote, order workflow and administration rather than relying on a hosted commerce platform.

> **Project status:** The repository contains a working application and automated tests. Payment-provider credentials, deployment configuration and live transaction behaviour must be verified in the target environment before describing online payments as production-enabled.

## Product capabilities

- Product catalogue with pack-size variants, pricing, stock and visibility controls.
- Browser-persisted basket and canonical cart page.
- Checkout with customer details, delivery address and map/GPS location input.
- Server-side cart reconstruction and price calculation; client-submitted prices are not authoritative.
- Delivery eligibility and fee calculation using road-distance routing, with a documented fallback path.
- Morning delivery slots, slot-capacity checks and order status history.
- Cash on Delivery and Cashfree hosted-checkout integration paths.
- Customer order tracking with masked customer details.
- Admin workflows for catalogue, inventory and order operations.
- Customer accounts and phone-verification flows.
- Order notifications and operational utilities.

## Architecture at a glance

| Layer | Implementation |
| --- | --- |
| Runtime | Node.js (20+) |
| HTTP API | Express 4 |
| Modules | JavaScript ES modules |
| Persistence | JSON files under the configured data directory |
| Security headers | Helmet |
| Delivery routing | OpenStreetMap geocoding and OSRM road routing |
| Payments | Cashfree integration; legacy PayU callback code remains in the codebase |
| Tests | Node.js built-in test runner |
| Deployment | Docker / Railway configuration |

### Important engineering constraints

The current JSON-file persistence layer is suitable for a small single-instance deployment, but it is not a substitute for transactional database storage. Concurrent read-modify-write operations can lose updates. Before increasing order volume or running multiple application instances, migrate order, inventory, customer and payment state to a transactional database.

The in-process rate limiter is also instance-local. Use a shared rate-limit store or edge protection for multi-instance deployments.

## Local development

Requirements: Node.js 20 or later and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

Useful commands:

```bash
npm test       # run the Node.js test suite
npm start      # start the production server
```

## Main application routes

| Route | Purpose |
| --- | --- |
| `/` | Storefront |
| `/cart` | Basket |
| `/checkout` | Checkout |
| `/track` | Order tracking |
| `/admin` | Admin interface |
| `/health` | Health endpoint |
| `/api/products` | Public product catalogue |
| `POST /api/quote` | Delivery quote |
| `POST /api/orders` | Order creation |

## Configuration

Configure secrets and environment-specific values outside source control. At minimum, review the production values for `NODE_ENV`, `HOST`, `PORT`, `APP_URL`, `ADMIN_KEY` and `DATA_DIR`. Configure Cashfree credentials through the supported deployment/admin configuration flow and verify the provider's server-side order status before treating an order as paid.

Never commit API secrets, payment salts, session-signing secrets, customer data or production data files.

## Engineering roadmap

See [Engineering roadmap](docs/ENGINEERING_ROADMAP.md) for the prioritized reliability, security, testing and database work.

## Scope and verification

This README describes capabilities found in the repository source. It does not claim that a live payment transaction, production deployment, penetration test or load test has been completed. Run the test suite and verify each external integration in a controlled environment before release.
