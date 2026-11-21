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

## Release summary

**0.1.0 — 2026-11-22:** first shared development baseline for menu, accounts,
cart/checkout, customer history, admin operations, cash and gated PayMongo payments.
Includes checkout idempotency, payment recovery, webhook validation and isolated
DB tests. This tag identifies source, not production acceptance.

Since that baseline, SEC-001's request-parser dependency was patched to
body-parser 2.4.0 with isolated compressed-request HTTP checks (PR #10).
Git commits and merged PRs retain the detailed change history.

## Contributing

### Scope and branches

Audit/planning work is read-only. For authorized implementation, use a
short-lived descriptive branch from current `main`: `fix/...`, `test/...`,
`security/...`, `feat/...`, `chore/...`, `docs/...`, `refactor/...` or `perf/...`.
A permanent `develop` branch is not required. Preserve unrelated local changes
and keep each branch focused on one approved task.

### Complete the Git workflow

For authorized implementation, the repository owner's standing workflow is:

1. Implement the scoped change with meaningful regression tests where needed.
2. Run applicable checks, review the diff and stage only related files.
3. Create coherent Conventional Commits and push the task branch.
4. Open or update its PR with the change, rationale, checks and material risks.
5. Wait for required CI to pass, then merge the reviewed PR into `main`.
6. Verify the merge and delete the merged branch both locally and remotely.
   If squash merging obscures ancestry, verify the branch's exact head against
   the merged PR before deletion. Preserve branches containing subsequent work.

Do not force-push, rewrite published history, bypass failed checks or continue
into an unrelated task. Scope changes, unsafe/destructive actions and unresolved
failures still require the appropriate decision. Never commit secrets or `.env`
values. Branch cleanup does not authorize deleting unmerged work.

### Validation and releases

Use the root pnpm workspace. Build shared types when their source changes.
Database-backed tests require command-scoped `DATABASE_URL="$TEST_DATABASE_URL"`,
exact URL equality and a database name containing `test`; never permanently
replace the normal URL. See [API test instructions](apps/api/README.md#run-tests).

Follow the versioning and release procedure below. Publishing a tag does not authorize enabling ordering, live
payments, new paid services or a separate production rollout.

## Project versioning

### Current baseline

Caffeinawa starts its project-wide version history at **0.1.0**. Before this
baseline there were no version tags; the API, web and types package versions were
inconsistent scaffold defaults. Existing features and the reliability work in
Git history justify an initial development baseline, not an arbitrary version
based on commit or PR counts.

Version 0.x indicates initial development. Version 1.0.0 is reserved for an
accepted product/API scope and satisfied release gates, including security and
operational readiness. A version tag identifies source; it does not certify a
live deployment, merchant activation or production readiness.

### One version for the private monorepo

The root `package.json` is the project version source of truth. The following
private workspace manifests must match it:

- `apps/api/package.json`
- `apps/web/package.json`
- `packages/types/package.json`

Run `pnpm version:check` to verify manifest consistency. CI runs the same dependency-free check before installation.

Keep their existing package names and `workspace:*` dependencies. These packages
are not published to npm. A project version does not change HTTP route prefixes
or the database migration numbering scheme.

### Choosing the next version

Use [Semantic Versioning](https://semver.org/) and the actual merged changes:

- While 0.x, use a patch increment for compatible fixes or maintenance releases;
  use a minor increment for a new capability milestone or incompatible contract
  change. Document breaking changes explicitly.
- After 1.0.0, compatible fixes increment PATCH, compatible features increment
  MINOR and incompatible public contract changes increment MAJOR.
- Use an explicit prerelease suffix when preparing a candidate for a planned
  release. Do not derive versions from the number of commits, PRs or deployments.
- Normal feature/fix branches do not bump versions automatically. A focused
  release-preparation PR updates the four manifests and the README release summary together.

### Release procedure

1. Start a release-preparation branch from current `main` with a clean tree.
2. Set the reviewed version in the root and all private workspace manifests.
3. Update the dated release summary in this README;
   summarize user-visible behavior, compatibility and material limitations.
4. Verify manifest consistency, frozen lockfile compatibility and applicable
   project checks. Pass required PR CI, review the diff and merge the PR.
5. Verify the merged commit's CI before creating an annotated `vX.Y.Z` tag that
   points to that exact commit, then push that tag explicitly.
6. Delete the merged task branch locally and remotely after verifying its head
   matches the merged PR. Never force-push or move an existing release tag.
7. Deploy only within the authorized rollout scope and verify the actual deployed
   commit separately. Tags and GitHub merges are not deployment evidence.

No release automation service or new dependency is required for this workflow.
