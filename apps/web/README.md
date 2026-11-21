# Caffeinawa storefront

Next.js App Router/React storefront with menu/cart, account and order history,
checkout recovery and admin screens. Shared contracts come from `packages/types`.

## Development

Run the root setup in [the project README](../../README.md). Configure
`apps/web/.env.local` securely with `NEXT_PUBLIC_API_URL` pointing to the API,
including its `/api` prefix (locally `http://localhost:3001/api`). Public variables
are embedded in browser assets: never place secrets in them.

```sh
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
STATIC_EXPORT=true pnpm --filter web build
```

Run these from the workspace root. The development site is on localhost:3000.
Build shared types after changing shared constants/contracts.

## Cloudflare Pages

The existing Pages project exports `apps/web/out`. `STATIC_EXPORT=true` enables
static export and trailing slashes; images are unoptimized. Supply the deployed
API URL at build time. Do not introduce Next server routes or server API fetching
during static builds. Production follows `main`; inspect its actual build result.

Verify menu, authentication redirects, order-result routes and admin route loading.
Server guards enforce authorization; frontend admin gating is not an access-control
boundary. Do not create production orders for deployment verification.

Store availability and payment methods come from the API. URL parameters never
prove payment; order status is fetched through authenticated endpoints. Unknown
checkout outcomes retain their IndexedDB intent; consult order history before
placing another order after clearing storage or switching devices. See the
[API recovery runbooks](../api/README.md#checkout-request-recovery).
