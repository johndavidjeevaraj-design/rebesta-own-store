# Engineering Roadmap

Priorities are ordered by customer impact and operational risk. Complete and verify each item before moving to the next.

## P0 — Protect orders, payments and customer data

- [x] Require an authenticated customer session or fresh OTP proof for order history, subscription changes and cancellation; do not use a phone number alone as identity proof.
- [x] Review phone-verification token binding. Reject verification when the provider cannot establish which phone number was verified.
- [x] Add a payment-session failure compensation path: mark the order failed/cancelled, release reserved inventory exactly once and record an audit event.
- [x] Add a scheduled reconciliation job for abandoned pending payments and stale stock reservations.
- [x] Verify Cashfree order ID, payment status, amount and currency server-side before marking an order paid.
- [x] Redact payment-provider payloads before persistence; retain only fields required for support and reconciliation.
- [x] Add CSRF protection or strict origin validation to cookie-authenticated state-changing routes.

## Current implementation status — PR #2

Implementation is drafted on fix/p0-customer-payment-security. GitHub Actions run 41394964648 passed JavaScript syntax checks and all 40 automated tests (commit 03f5c5b9a336d5b6b69a5bf2bf89078ccf34f9dd), including the final late-payment and cross-origin polling safeguards.

- Order history, subscription reads/creation/updates, cancellation, payment retry, UPI QR and payment polling require a verified session and derive order ownership from it. Phone query/body fields are not used as identity proof.
- Cookie-authenticated customer mutations enforce same-origin checks using the configured application origin and Fetch Metadata.
- MSG91 widget signup/sign-in fail closed unless the verified response contains the exact submitted phone. Production response shape still requires confirmation with an actual MSG91 test account/fixture.
- Cashfree Create Order uses a stable idempotency key and a 30-minute provider expiry. Definitive 4xx rejections (except conflict) release stock; ambiguous outcomes keep the reservation until provider reconciliation.
- Initial order creation writes a reservation journal before stock mutation. Startup recovery replays it using per-product idempotency markers, then ensures the order record exists.
- Online customer cancellation terminates the Cashfree order first and releases inventory only after Cashfree reports TERMINATED. Pending termination keeps stock reserved.
- Callback, payment polling, webhook and reconciliation require authoritative Cashfree Get Order and Get Payments checks for merchant order ID, PAID/SUCCESS status, payment ID, amount and INR currency.
- Webhooks preserve the raw request body for HMAC verification and persist payment IDs to deduplicate repeated events. A reconciliation worker checks delayed payments, expired/missing provider orders, delayed termination, and late payments after cancellation.
- Cashfree response persistence is limited to a minimal allowlist of support/reconciliation fields. OTP logs now redact full phone numbers and raw MSG91 response bodies.

### Remaining provider and operational verification

- Confirm MSG91's production widget response phone property using a real test-widget response. Missing or mismatched phone values are rejected in all cases.
- Confirm Cashfree webhook delivery is enabled for the configured notify_url and verify the deployed webhook secret configuration in the Cashfree sandbox dashboard.
- The repository still uses separate JSON files; the reservation journal handles one in-flight order creation in a single application process, but does not provide multi-process locking or full database transaction isolation. PostgreSQL remains required before horizontal scaling.
- CI passes on the current source: lockfile install, JavaScript syntax checks and 40 automated tests. No lint or build scripts exist in package.json.
- Provider sandbox configuration and production deployment still require owner-side verification; no live payment or production data was used.
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
