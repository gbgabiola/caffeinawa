# Caffeinawa API

NestJS API with Prisma/PostgreSQL. Run commands below from the repository root.

## Setup

Use the root frozen pnpm install, build shared types and generate Prisma first
(see [root README](../../README.md)). Securely configure `apps/api/.env`:
`DATABASE_URL` (normal caffeinawa database), `JWT_SECRET` (strong private secret),
`WEB_URL` (storefront HTTP(S) origin only), and optional `PORT` (default 3001).
Use `PAYMONGO_ENABLED=false` for cash-only operation. Enabling payments additionally
requires matching `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` and
`PAYMONGO_MODE=test|live`. Never commit these values.

`AUTH_CLIENT_IP_SOURCE` defaults to `socket`. The deployed Render web service uses
`render-cloudflare`; do not blindly enable Express trust proxy or trust arbitrary
forwarding headers. The limiter is in memory on one instance and resets on restart.

Review migrations before applying to any development database:

```sh
pnpm --filter api exec prisma migrate deploy
pnpm --filter api dev
```

The API prefix is `/api`; readiness is `/api/health/ready`, liveness
`/api/health/live`. CORS uses `WEB_URL`. Startup validates configuration before
creating the app; tests constructing AppModule do not replace a startup check.

## Run tests

```sh
pnpm --filter api test
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api test:e2e
```

Export `TEST_DATABASE_URL` securely first. E2E configuration refuses to load unless
`DATABASE_URL` exactly equals it and the decoded database name contains `test`.
Never replace the normal URL permanently. Use command-scoped overrides for test
migrations too. Fixtures must clean up only their owned data.

## Render deployment

Use the existing free service and `render.yaml`; do not provision replacements.
Build: frozen install, shared types build, Prisma generate, API build. Start:
`prisma migrate deploy` then `start:prod`, as configured in the Blueprint.
Preserve service secrets, inspect deployment status through `live`, and check
readiness, public menu/ordering, protected-route rejection and CORS. Never probe
malicious payloads or create test orders against production. A merge or tag alone
is not a verified deployment.

## Checkout request recovery

Checkout requires an authenticated owner, a UUID v4 `idempotencyKey`, the reviewed
cart's integer `cartRevision`, and `paymentProvider` (`cash` or `paymongo`). Missing
keys/revisions fail validation; older browser tabs must refresh. Do not generate
keys server-side or automatically retry with a fresh key.

```json
{
  "idempotencyKey": "e66e8068-44a7-4d21-80b4-070708a15155",
  "cartRevision": 3,
  "paymentProvider": "cash"
}
```

`POST /api/customers/:customerId/cart/checkout` returns 201 for a new order, or
200 with `{ checkoutReplayed: true, order, paymentProvider }` for an existing
request. The key is scoped to its customer and bound to payment method/revision.
Reusing it with a different payload returns 409. Every successful cart mutation
and checkout increments the cart revision; stale checkout requests return 409.

`POST /api/customers/:customerId/cart/checkout/recover` accepts the same payload.
It returns the existing order or `{ checkoutNotCreated: true }`. The latter
atomically closes the unused key, preventing a delayed original request from
creating an order. Recovery never cancels an order or modifies a payment. It
works while ordering or PayMongo is disabled and with an empty/refilled cart.

The request ledger, order, pending payment, cart clear and revision increment
commit together. Transactions lock request, cart, then store settings in that
order. External provider calls occur only after commit and only for the original
request. Merchant checkout replay/recovery does not contact PayMongo. A separate, explicit
payment-resume operation can launch a never-started attempt once or retrieve a
known session. Ambiguous provider creation is never repeated. See [payment recovery](#paymongo-payment-recovery).

The browser stores one immutable intent per customer in native IndexedDB before
sending checkout. A read/write transaction serializes creation across tabs.
Unknown outcomes retain the intent across reloads. A resolved reference remains
until its authenticated order lookup succeeds. Storage failures block new
checkout. Clearing site storage or switching devices can lose a browser's request
reference; customers should consult order history before placing another order.
The server does not infer that distinct keys represent the same purchase.

Do not expire request keys/tombstones independently of retained orders/customers.
Their deletion permits reuse of a previous key. Existing customer/order deletion
cascades to their ledger records; no new deletion endpoint is introduced.

### Verification

Use the isolated test database; `DATABASE_URL` must equal `TEST_DATABASE_URL`
exactly, with a database name containing `test`. Never replace the normal URL in
an environment file. Apply migrations to the test database first:

```sh
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api exec prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api test:e2e
pnpm --filter api test
pnpm --filter web test
```

For manual Postman checks against a development/test API: GET the cart, copy its
revision, and POST checkout with a new UUID. Repeat the identical POST and confirm
200 with the same order. Refill the cart and repeat again: the original order must
return and the refilled cart must remain. For an unused UUID, POST recovery first,
then checkout: recovery returns `checkoutNotCreated` and checkout returns 409.
Do not create production orders merely to smoke-test deployment.

### Rollout

The migration is additive and backfills existing cart revisions to zero. Deploy
API/migration and storefront together while ordering is closed. Keep PayMongo
disabled. Check readiness, protected routes and storefront routes without creating
orders. Stale clients receive validation errors until refreshed. Do not roll back
to an API that accepts unkeyed checkout after enabling the new storefront.

## PayMongo payment recovery

### Verified behavior (November 4, 2026)

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

### One-attempt creation

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

### Customer recovery

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

### Tests and enablement boundary

Database tests use an isolated test database and a deliberately non-idempotent
provider simulator: every POST creates a different resource. They verify that
lost responses, concurrent recovery and persistence failures never cause a second
POST. They also cover crash-before-claim recovery, known-session retrieval,
credential changes, age cutoff, ownership, disabled payments and settlement races.

Signed paid-webhook delivery was verified on November 5, 2026 using an official
sandbox QR Ph checkout and PayMongo's simulator, with an isolated local test
database. The actual event used the formal event envelope and included paid
amount/currency evidence. It committed PAID / CONFIRMED state; replaying the
authenticated event preserved settlement. The Dashboard's incomplete default
sample was correctly rejected. See [signed webhook verification](#signed-paymongo-webhook-validation)
for the exact evidence, safeguards and reproducible command.

Production remains closed and cash-only. On November 5, 2026 the existing
test-mode webhook was moved from its obsolete tunnel URL to the deployed Render
webhook endpoint, with the matching signing secret configured securely on the
service. `PAYMONGO_MODE=test` and `PAYMONGO_ENABLED=false` remain explicit. See the
[deployed endpoint runbook](#deployed-endpoint-configuration-november-5-2026)
for deployment checks and the boundary between test configuration and live
acceptance. Live merchant readiness and matching live credentials are still
required before an explicitly authorized rollout. The additive migrations run
through the existing API start command. No new paid service, background worker,
queue or polling job is required.

## Signed PayMongo webhook validation

### Contract and settlement

The [formal event reference](https://docs.paymongo.com/docs/developer-tools-webhooks-events)
defines an event resource at `data.id`, `data.type=event` and `data.attributes`.
For `checkout_session.payment.paid`, the nested resource is a checkout session
with an order reference and a payments array. The handler requires exactly one
paid payment, a positive safe integer centavo amount, a three-letter currency,
and consistent intent/mode fields when present. Payment resource `type` is optional
because the Hosted Checkout example omits it; a supplied value must be `payment`.
Other failed attempts may coexist.

The [signature reference](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
uses HMAC-SHA256 over the timestamp, a dot and the exact raw request bytes. The
handler selects `te` or `li` from explicit `PAYMONGO_MODE`, checks a five-minute
clock tolerance, rejects duplicate active signature fields, then parses strict
UTF-8 JSON. The event's mode must match the configured endpoint mode.

The Hosted Checkout guide contains a different envelope illustration. The
handler does not invent a missing event identity or accept that shape without
provider delivery evidence. Signed unrelated event types are acknowledged without
settlement; only checkout-session paid events reach the payment transaction.

Settlement verifies the session/provider/order binding and the paid amount and
currency against the pending payment before claiming it. A mismatch leaves the
payment unpaid and creates an OPEN `PAYMENT_DETAILS_MISMATCH` reconciliation
issue outside the rolled-back transaction. A later valid delivery does not erase
that audit record. Duplicates retain the original `paidAt` and winning event ID.

Success is acknowledged after the database transaction commits. An unexpected
database failure returns a retryable error; this single-instance deployment has
no durable background queue that would justify acknowledging before persistence.
Store closure or disabled new PayMongo checkout does not block valid settlement.

### Verification command

Credentials stay in secure local environment storage. Normal `DATABASE_URL`
continues to target `caffeinawa`; each database-backed command below receives the
exact `TEST_DATABASE_URL` only for that command. The runner also requires a local
host and a database name containing `test`.

```sh
pnpm --filter @caffeinawa/types build
pnpm --filter api exec prisma generate
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api exec prisma migrate deploy
pnpm --filter api build
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api webhook:verify --self-test
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api webhook:verify
```

`--self-test` sends two locally signed HTTP requests and verifies committed,
idempotent settlement. It does not contact PayMongo or start a tunnel. CI runs
this mode and verifies that the normal database URL is rejected before startup.

The interactive mode requires `cloudflared`, a securely configured `sk_test_`
key and `PAYMONGO_MODE=test`. It starts a temporary HTTPS tunnel exposing only the
webhook path; all other routes return 404. It waits for the hostname to become
reachable, registers a separate temporary test webhook and retains its signing
secret only in process memory. Existing webhook configuration and environment
files are unchanged.

Interactive verification creates one QR Ph sandbox checkout using the official
PayMongo API and binds it to the isolated payment. It never retries session
creation after failure. Open the printed checkout URL and use only PayMongo's
test simulator. **Do not scan the QR with a bank or wallet app:** the
[testing reference](https://docs.paymongo.com/docs/payment-acceptance-testing) warns
that even a test-mode QR can process a real transaction.

The runner checks one genuine signed paid delivery and then replays that
authenticated event directly through settlement to verify unchanged state. It
reports the provider delivery and local replay separately. It disables and
deletes its temporary webhook, stops its tunnel and removes its own test
fixtures on completion, interruption or a 15-minute timeout. An unpaid known
sandbox session is expired; a paid test record remains in the provider account.
If a creation response is ambiguous, review the printed sandbox order reference
in the Dashboard; do not repeat creation for that reference.

The Dashboard Test Events sample received on November 5, 2026 had a valid
signature and the formal event envelope, but its payment contained status and
fees without amount or currency. Rejecting that incomplete sample is intentional;
line items and fees are not proof of a matching paid amount. The Dashboard sample
is therefore not a positive settlement test.

### Deployed endpoint configuration (November 5, 2026)

The existing test-account webhook originally pointed to an obsolete temporary
tunnel. It was disabled to stop stale test retries, then updated to:

`https://caffeinawa-api.onrender.com/api/webhooks/paymongo`

It subscribes only to `checkout_session.payment.paid`. The existing signing
secret was preserved and configured securely as `PAYMONGO_WEBHOOK_SECRET` on the
Render service. `PAYMONGO_MODE=test` and `PAYMONGO_ENABLED=false` remain explicit.
These values are service-level configuration; no secret values belong in this
repository. Render's merge operation preserves unrelated settings and triggers a
configuration deployment. Preserve the service-level secret configuration when
managing future deployments; never replace the complete environment collection
for a single-key change.

After deployment, verify a correctly signed unrelated event returns 200 without
settlement, and invalid signatures or event modes return 401. Re-enable the
provider webhook only after those checks pass. This proves the deployed handler
uses the matching secret and mode; it is not an additional genuine provider paid
delivery. The genuine sandbox settlement evidence below used the isolated local
test database.

The deployed storefront remains closed and cash-only. This is **test-mode webhook
configuration on the deployed API**, not live payment activation. Live merchant
readiness, matching live API/webhook credentials and an explicitly authorized
acceptance rollout remain separate requirements. Do not enable live payments by
changing only `PAYMONGO_ENABLED`.

### Current evidence

- The November 5 configuration deployment is live. The persistent test-mode
  webhook is enabled at the deployed API URL with its matching signing secret.
  Deployed HTTP probes returned 200 for a valid signed unrelated event, 401 for
  an invalid signature, 401 for an incorrect event mode and 400 for incomplete
  paid evidence. None reached settlement or required production test orders.
- Readiness, storefront/menu access, protected-route rejection, CORS and ordering
  cache headers passed after the configuration deployment. Ordering remained
  closed and the public payment methods remained cash-only.

- Local raw HTTP signature, settlement and duplicate self-test passed.
- Database tests cover amount/currency mismatches, tampering, mode confusion,
  concurrent duplicates, cancelled-order rollback and recovery after a database
  failure before commit.
- A genuine signed Dashboard sample reached the handler and was rejected for
  missing paid amount/currency evidence.
- On November 5, 2026, one official sandbox QR Ph checkout was completed using
  PayMongo's simulator URL. Its genuine signed paid event passed the formal
  envelope validator, matched PHP 250.00, and committed PAID / CONFIRMED state in
  the isolated local test database. A local replay of that authenticated event
  preserved the winning event ID and timestamp. This was one provider delivery
  plus one local service replay, not two provider deliveries.
- The temporary webhook was disabled and deleted; its tunnel stopped and owned
  local fixtures were removed. The paid sandbox record remains at the provider.
  No production order, real transfer, or infrastructure change was required.
