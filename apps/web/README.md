# Caffeinawa web

Next.js App Router storefront and admin interface. Follow the
[root setup](../../README.md) first. Run commands from the repository root.

## Environment

Copy `.env.example` to `apps/web/.env.local` on first setup.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API base URL including `/api`; defaults to `http://localhost:3001/api`. Embedded at build time and public. |
| `STATIC_EXPORT` | Set to `true` for Cloudflare Pages; leave false for development. |

Keep credentials on the API, never in public web variables.

## Commands

```sh
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web typecheck
STATIC_EXPORT=true pnpm --filter web build
```

Cloudflare Pages builds from `main` and publishes `apps/web/out`. Set the deployed
API URL at build time. Static export uses trailing slashes and unoptimized images;
server routes and server API fetching during builds are unsupported.

## Behavior

The sun/moon switch follows the system theme until a manual choice is saved.
Store availability and payment methods come from the API. Payment return URLs do
not prove payment; authenticated order status is authoritative.

Unknown checkout outcomes retain their recovery request in IndexedDB. Check order
history before ordering again after clearing storage or switching devices.
Admin photo limits and payment recovery are covered in the [API README](../api/README.md).
