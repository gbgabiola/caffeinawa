# PayMongo payment recovery

## Verified behavior (November 4, 2026)

The official [idempotency page](https://docs.paymongo.com/reference/idempotent-requests)
describes creation replay and 24-hour key retention. **Sandbox verification did
not reproduce that guarantee for V2 checkout creation:** two POSTs with the same
UUID key and exact request body returned different session IDs. Both synthetic
sessions were expired afterward. Do not rely on that header to prevent duplicate
checkout sessions, and do not add automatic or customer-triggered creation retries.

The [V2 creation reference](https://docs.paymongo.com/reference/create_checkout_sessions_2)
uses `POST /v2/checkout_sessions`. The [retrieval reference](https://docs.paymongo.com/reference/get_checkout_sessions)
uses `GET /v1/checkout_sessions/:id`, including V2-created sessions. Actual sandbox
GET responses passed the session/reference/amount/mode validator for an active
unpaid session, repeated read, and confirmed expiry. All three sandbox sessions
created during verification were expired; no Caffeinawa order or real payment
was created.
The [checkout lifecycle](https://docs.paymongo.com/docs/payment-channels-key-concepts)
allows returning customers to a known active session; it does not justify creating
a replacement for an unknown session. The [expiry endpoint](https://docs.paymongo.com/reference/create_checkout_sessions_id_expire)
was used only to clean up the synthetic sandbox sessions.

## One-attempt creation

The cart transaction creates the order, pending payment and immutable
`PayMongoCheckoutAttempt` together. The snapshot contains the exact request body,
credential/origin/mode fingerprint and database creation time. It contains billing
information but no API secret; never log or expose it.

Before external creation, an atomic `startedAt IS NULL` update claims the attempt.
The claim is permanent: no lease, reset, expiry or retry after failure. Only the
winner may make one provider POST. A crash after claiming, a lost response, or
failure saving the response requires manual review. The provider idempotency
header is still sent, but application correctness never relies on it.

A never-claimed attempt can make its first POST after checkout recovery. The
snapshot must still match the configured credential/origin/mode and be younger
than 23 hours. That is a local initial-launch freshness policy, **not** a retry
window or a provider guarantee. Legacy missing snapshots stay in manual review.
The migration marks any pre-existing snapshots as started to fail closed.

No provider HTTP call runs inside a database transaction. Each call has a
10-second deadline covering headers and body. No automatic network retries occur.

## Customer recovery

- `GET /api/orders/:orderId/payment-checkout` returns only `canResume` and a safe
  message. It does not contact PayMongo.
- `POST /api/orders/:orderId/payment-checkout/resume` retrieves the saved session
  or claims a never-started first creation. It never repeats an attempted POST.
- Foreign orders return 404; signed-out requests return 401. Responses are
  `no-store`. Resume is limited to five requests/minute per normalized client IP
  through the existing single-instance in-memory limiter and Render/Cloudflare
  IP policy. Capability reads remain available.

Known session IDs use GET only, even after the initial-launch window. Retrieval
validates session ID, order reference, PHP line-item total, mode, HTTPS checkout
host, status and payment state. Paid, processing, expired or malformed sessions
do not yield a payable URL. Local order/payment state is checked again after
provider I/O for concurrent settlement/cancellation. Previously shared provider
URLs can still receive external activity; webhook reconciliation handles conflicts.

Only pending orders with exactly one pending PayMongo payment are eligible.
Recovery works while store ordering is closed, but respects `PAYMONGO_ENABLED`.
Cash and terminal orders do not expose a resume action. The browser never resumes
automatically or treats a return URL as proof of payment. Operators must use the
order reference to investigate ambiguous attempts in PayMongo; this release does
not add an unverified session-attachment, replacement, cancellation or refund tool.

## Tests and enablement boundary

Database tests use an isolated test database and a deliberately non-idempotent
provider simulator: every POST creates a different resource. They verify that
lost responses, concurrent recovery and persistence failures never cause a second
POST. They also cover crash-before-claim recovery, known-session retrieval,
credential changes, age cutoff, ownership, disabled payments and settlement races.

Before enabling payment acceptance, validate real signed paid-webhook delivery in
the merchant's test account. The current [Hosted Checkout guide](https://docs.paymongo.com/docs/payment-channels-hosted-checkout)
shows a different envelope from the legacy validator. A captured test-mode event
is required to establish actual delivery format, signature verification, duplicate
handling and delayed settlement. Use Postman with a development/test API and
command-scoped `DATABASE_URL="$TEST_DATABASE_URL"`; keep credentials in secure
environment storage and never replace the normal database URL. No real transfer
is needed for verification.

Production stays closed and cash-only until that account/webhook validation is
complete. The additive migrations run through the existing API start command.
No new paid service, background worker, queue or polling job is required.
