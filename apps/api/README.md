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

Checkout requires the authenticated cart owner, a UUID v4 `idempotencyKey`, the
reviewed integer `cartRevision`, and `paymentProvider` (`cash` or `paymongo`).
Cart mutations advance the revision; stale checkouts return 409. Refresh old tabs.

`POST /api/customers/:customerId/cart/checkout` creates once (201) or replays the
same request (200). Reusing a key with a different payload returns 409.
`POST /api/customers/:customerId/cart/checkout/recover` accepts the same payload
and returns the order or `checkoutNotCreated`, which closes the unused key against
late requests. Recovery works while closed and never cancels an order or payment.

Unknown browser outcomes retain their immutable IndexedDB intent. Do not retry
with a new key. After clearing storage or switching devices, consult order history
before ordering again. Do not prune request keys independently of retained orders.
Deploy compatible API and storefront versions while ordering is closed.

## PayMongo payment recovery

Provider session creation occurs after the order transaction and is attempted
once. An ambiguous timeout requires operator review, never another creation.
Explicit owner-only resume retrieves a known session or launches a never-started
attempt once; paid/expired sessions must not be offered for payment.

Webhook settlement uses the raw request body and configured signing secret,
validates mode and paid amount/currency against the pending payment, and commits
before acknowledging success. Duplicate events preserve the winning timestamp.
Cancelled-order or payment-detail conflicts require reconciliation. Store closure
and disabled new checkout do not prevent valid settlement. Paid cancellation does
not automatically refund; inspect the provider before taking manual action.

## Isolated webhook verification

```sh
pnpm --filter api build
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api webhook:verify --self-test
```

The self-test uses the local isolated test database and locally signed events.
Interactive `webhook:verify` additionally requires `cloudflared`, test-mode
credentials, and PayMongo's official simulator. Never scan a sandbox QR using a
real banking or wallet app. The runner owns temporary fixtures/webhooks/tunnels;
verify their cleanup after interruption. Never repeat ambiguous session creation.
Dashboard samples without paid amount/currency are not valid settlement evidence.

The deployed webhook path is `/api/webhooks/paymongo`. Preserve its matching
service-level signing secret and mode; never replace the complete environment
collection to change one setting. Live merchant acceptance, credentials, backup
recovery and authorized rollout remain separate release gates.
