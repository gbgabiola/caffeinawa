# Checkout request recovery

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
request. Replay/recovery never creates or retries a PayMongo session; ambiguous
provider outcomes still require reconciliation. No provider idempotency or safe
session-resume guarantee is assumed.

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

## Verification

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

## Rollout

The migration is additive and backfills existing cart revisions to zero. Deploy
API/migration and storefront together while ordering is closed. Keep PayMongo
disabled. Check readiness, protected routes and storefront routes without creating
orders. Stale clients receive validation errors until refreshed. Do not roll back
to an API that accepts unkeyed checkout after enabling the new storefront.
