# Engineering Roadmap

Priorities are ordered by customer impact and operational risk. Complete and verify each item before moving to the next.

## P0 — Protect orders, payments and customer data

- [ ] Require an authenticated customer session or fresh OTP proof for order history, subscription changes and cancellation; do not use a phone number alone as identity proof.
- [ ] Review phone-verification token binding. Reject verification when the provider cannot establish which phone number was verified.
- [ ] Add a payment-session failure compensation path: mark the order failed/cancelled, release reserved inventory exactly once and record an audit event.
- [ ] Add a scheduled reconciliation job for abandoned pending payments and stale stock reservations.
- [ ] Verify Cashfree order ID, payment status, amount and currency server-side before marking an order paid.
- [ ] Redact payment-provider payloads before persistence; retain only fields required for support and reconciliation.
- [ ] Add CSRF protection or strict origin validation to cookie-authenticated state-changing routes.

## P1 — Data consistency and scale

- [ ] Migrate JSON-file persistence to PostgreSQL.
- [ ] Use database transactions for order creation, stock reservation, payment state transitions and cancellation.
- [ ] Add unique/idempotency constraints for provider order IDs, webhook event IDs and checkout requests.
- [ ] Move rate limiting to Redis or a trusted edge service before adding application instances.
- [ ] Replace synchronous password hashing with asynchronous `crypto.scrypt`.
- [ ] Add explicit data retention, backup restore and disaster-recovery procedures.

## P1 — Automated verification

- [ ] Add tests for customer authorization boundaries and phone-number enumeration.
- [ ] Add payment callback tests: duplicate, invalid signature, wrong amount, wrong currency, delayed and out-of-order events.
- [ ] Add inventory concurrency tests and cancellation/payment race tests.
- [ ] Add checkout integration tests for COD and online payment failure paths.
- [ ] Add CI for install, tests, lint and dependency/security review.

## P2 — Operations and maintainability

- [ ] Add structured request IDs and redacted logs.
- [ ] Add metrics for checkout conversion, payment failures, stock conflicts and delivery quote failures.
- [ ] Add alerting for repeated webhook failures and stale pending orders.
- [ ] Document local setup, production configuration and rollback procedures.

## Acceptance criteria

- No customer can read or mutate another customer's orders using only a phone number.
- A failed/expired online payment cannot reserve stock indefinitely.
- Duplicate webhooks and retries do not duplicate state transitions or stock adjustments.
- A paid order is confirmed only after authoritative provider verification.
- CI passes on every pull request.
