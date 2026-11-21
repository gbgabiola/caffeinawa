# Caffeinawa

Coffee-commerce monorepo with a static storefront, authenticated customer checkout,
admin operations, cash payments and gated PayMongo integration.

## Workspace

- `apps/api`: NestJS, Prisma/PostgreSQL; [API setup and operations](apps/api/README.md).
- `apps/web`: Next.js App Router, React, TanStack Query; [storefront setup](apps/web/README.md).
- `packages/types`: shared runtime constants and API contracts, built to `dist`.

## Development

Use Node.js 24 and pnpm 12.4.1. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @caffeinawa/types build
pnpm --filter api exec prisma generate
pnpm dev
```

Configure local environment values securely as described in the application
READMEs before starting. Never commit secrets or print connection strings.

## Quality gates

```sh
pnpm version:check
pnpm lint
pnpm test
pnpm build
pnpm typecheck
STATIC_EXPORT=true pnpm --filter web build
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api test:e2e
```

Database tests require an existing isolated test database; see the API README.
CI additionally applies migrations only to its isolated PostgreSQL test service
and verifies signed webhook handling. Passing tests alone does not establish
production readiness.

## Hosting and release boundaries

The storefront is exported to Cloudflare Pages; the API uses the existing free
Render service and Neon PostgreSQL. Do not introduce paid services or upgrades.
Render deploys are manual; its start command applies committed migrations before
starting the API. Verify the deployed commit and `/api/health/ready` after rollout.
Cloudflare production builds follow `main`. Preserve existing environment secrets.

Ordering remains closed and new PayMongo checkout disabled until an explicitly
approved acceptance rollout. Live merchant readiness, backups/restore verification
and broader dependency advisory triage remain release gates. Paid cancellation
does not automatically refund. Do not create production orders for smoke tests.

## Contributing and versioning

Use a focused short-lived branch from current `main`; preserve unrelated work.
Validate, commit with Conventional Commits, push a PR, wait for CI, merge, and
remove the merged branch after verifying its head. Do not force-push or bypass
checks. A permanent `develop` branch is unnecessary.

The root and private workspace packages share one Semantic Versioning version.
Run `pnpm version:check`. Prepare version changes in a release PR; after merged
CI passes, create and push an annotated tag for that exact commit. Never move an
existing tag. Git history and PRs hold change history; READMEs describe current use.
A tag does not certify deployment or authorize live payment activation.
