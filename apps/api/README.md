# Caffeinawa API

NestJS API with Prisma/PostgreSQL. Follow the [root setup](../../README.md) first.
Run commands from the repository root. Routes use the `/api` prefix.

## Environment

Copy `.env.example` to `apps/api/.env` on first setup. Keep values private.

| Variable | Required / default |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection URL for the normal application database. |
| `JWT_SECRET` | Required strong, private signing secret. |
| `WEB_URL` | Required storefront HTTP(S) origin, without a path, credentials, query or fragment. |
| `PORT` | Optional; `3001`. |
| `AUTH_CLIENT_IP_SOURCE` | Optional; `socket` locally. Use `render-cloudflare` only on the configured Render web service. |
| `TEST_DATABASE_URL` | Required only for database tests; separate database with `test` in its name. |
| `PAYMONGO_ENABLED` | Optional; `false` for cash-only new checkout. |
| `PAYMONGO_MODE` | `test` or `live`; required when PayMongo is enabled. |
| `PAYMONGO_SECRET_KEY` | Required when PayMongo is enabled; match the selected mode. |
| `PAYMONGO_WEBHOOK_SECRET` | Required when PayMongo is enabled and for receiving signed webhook events. |
| `PAYMONGO_API_URL` | Optional; `https://api.paymongo.com`. Normally leave unchanged. |
| `COFFEE_IMAGE_UPLOAD_ENABLED` | Optional; `false`. |
| `CLOUDINARY_CLOUD_NAME` | Required when photo uploads are enabled; cloud name, not API key name. |
| `CLOUDINARY_API_KEY` | Required when photo uploads are enabled. |
| `CLOUDINARY_API_SECRET` | Required when photo uploads are enabled; API-only secret. |

Startup validates configuration. Keep webhook credentials available for outstanding
payments even when new PayMongo checkout is disabled. Do not broadly trust proxy
headers. Authentication rate limits are in memory and reset on restart.

## Commands

```sh
pnpm --filter api dev
pnpm --filter api test
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api build
```

## Tests

Export `TEST_DATABASE_URL` securely for an isolated PostgreSQL database, then:

```sh
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api exec prisma migrate deploy
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api test:e2e
```

The test runner requires exact URL equality and a database name containing `test`.
Never permanently replace the normal `DATABASE_URL` or run these against production.

## Payments and recovery

Checkout requires the cart owner, a UUID v4 `idempotencyKey`, reviewed integer
`cartRevision` and `paymentProvider` (`cash` or `paymongo`). Stale carts or key reuse
with a different payload return 409. The same request creates once (201) or replays
(200). Owner recovery at `POST /api/customers/:customerId/cart/checkout/recover`
accepts the same payload and returns the order or `checkoutNotCreated`.
Never retry an unknown outcome with a new key or prune keys independently of orders.

PayMongo session creation happens after the order commits. Ambiguous creation
requires provider review, not another creation attempt. Resume retrieves a known
session or starts a never-attempted creation once. Webhooks at
`/api/webhooks/paymongo` verify the raw-body signature, mode, amount and currency;
duplicate settlement is idempotent. Inspect reconciliation issues for conflicts.
Paid cancellation does not automatically refund.

For isolated signed-webhook checks:

```sh
pnpm --filter api build
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api webhook:verify --self-test
```

Interactive verification also needs `cloudflared` and test-mode credentials.
Use only the provider simulator, never a real bank or wallet transfer. Check cleanup
of temporary fixtures, webhooks and tunnels after interruption.

## Coffee photos

Admin uploads accept non-animated JPEG, PNG or WebP up to 3 MB and 8 megapixels.
The API re-encodes to WebP, stores photos in Cloudinary and references them in Neon.
External image URLs are also supported. Render does not store uploaded files.

Photo upload follows saving coffee details. Failed uploads retain the saved coffee
and current photo. Review uncertain uploads and superseded assets in Cloudinary
before retrying or deleting; provider assets are not deleted automatically.

## Deployment

Use the existing free Render service and `render.yaml`. Its build generates Prisma,
builds shared types and compiles the API; startup applies committed migrations.
Store secrets in Render, preserve existing values and verify the deployed commit
and `/api/health/ready`. Liveness is `/api/health/live`.

Keep ordering closed during incompatible rollouts. Verify deployments with read-only
checks, without production test orders. Retain encrypted backups separately from
the database and verify restores in an isolated database.
