# PayMongo payment recovery

The provider contract was checked on November 4, 2026 against these official pages:

- [Idempotent requests](https://docs.paymongo.com/reference/idempotent-requests): creation requests support `Idempotency-Key`; results expire after 24 hours. Retrying with changed parameters is rejected.
- [Developer best practices](https://docs.paymongo.com/docs/developer-tools-best-practices-1): keys are scoped to API credentials, method and endpoint.
- [V2 session creation](https://docs.paymongo.com/reference/create_checkout_sessions_2): `POST /v2/checkout_sessions` creates the hosted session.
- [Session retrieval](https://docs.paymongo.com/reference/get_checkout_sessions): `GET /v1/checkout_sessions/:id` reads sessions, including V2-created sessions.
- [Checkout lifecycle](https://docs.paymongo.com/docs/payment-channels-key-concepts): customers can return to the existing active checkout; expired sessions must not be replaced while an earlier payment remains uncertain.

## Creation and recovery

The original cart transaction creates the order, pending payment and immutable
`PayMongoCheckoutAttempt` together. The snapshot contains the exact request body,
credential/origin/mode fingerprint and database creation time. It contains customer
billing information but no API secret; do not log or expose it. The payment ID is
the provider idempotency key. Keep the snapshot for the payment's lifetime.

No provider HTTP call runs inside a database transaction. Creation has a 10-second
deadline covering headers and body. There are no automatic network retries.

The authenticated customer may explicitly resume an existing order:

- `GET /api/orders/:orderId/payment-checkout` returns only `canResume` and a safe
  message. It does not contact PayMongo.
- `POST /api/orders/:orderId/payment-checkout/resume` either returns a validated
  checkout URL or an awaiting-confirmation/unavailable response. Foreign orders
  return 404; signed-out requests return 401. Both responses are `no-store`.
  Explicit resume is limited to five requests/minute per normalized client IP;
  capability reads remain available. This shares the existing single-instance
  in-memory limiter and its verified Render/Cloudflare client-IP policy.

For a missing session ID, recovery must reuse the saved body, payment ID and API
scope. It is allowed for **less than 23 hours after snapshot creation**, leaving a
one-hour margin before PayMongo's documented expiry. Key rotation, origin/mode
changes, expired windows and legacy missing snapshots require manual review.
The code never replaces the key or manufactures a new attempt for these cases.

Known session IDs use GET only, even after 23 hours. Retrieval validates session
ID, order reference, PHP line-item total, mode, HTTPS checkout host, session status
and payment state. Paid, processing, expired or malformed sessions do not yield a
payable URL. Order/payment state is read again after provider I/O to catch
concurrent settlement/cancellation. A session already shared with a customer can
still receive external activity; existing webhook reconciliation handles conflicts.

Only pending orders with exactly one pending PayMongo payment are eligible.
Recovery works while store ordering is closed, but respects `PAYMONGO_ENABLED`.
Cash orders and fulfilled/cancelled orders do not expose a resume action.
The browser never resumes automatically or treats a return URL as proof of payment.

## Validation and release boundary

Automated tests use an isolated local test database and a simulated idempotent
provider. They exercise committed snapshots, process crashes, lost responses,
concurrent recovery, payload stability after profile edits, retention cutoff,
credential rotation, ownership and settlement races. No paid provider request or
real customer order is needed for these tests.

Before enabling PayMongo, validate the actual merchant account in **test mode**:
use Postman against a development/test API with command-scoped
`DATABASE_URL="$TEST_DATABASE_URL"`, `PAYMONGO_MODE=test` and securely configured
test credentials. Never replace the normal database URL or commit credentials.
Confirm V2 creation, V1 retrieval and repeated identical-key creation return the
same session. Verify real signed paid-webhook delivery and its envelope against
the current validator, including duplicate delivery and delayed settlement.
The current Hosted Checkout guide shows a different webhook envelope from the
legacy validator; a captured test-mode event is needed to establish the account's
actual delivery format before enabling payment acceptance. Do not make a real
transfer for verification.

Production remains closed and cash-only until that provider/account validation is
complete. Deploy this additive migration through the existing API start command;
no new service, paid plan, background worker or polling job is required.
