# Caffeinawa

[![README views](https://hits.sh/github.com/gbgabiola/caffeinawa.svg?label=README%20views&color=a4521c)](https://hits.sh/github.com/gbgabiola/caffeinawa/)

Coffee ordering with customer accounts, a cart, order history and admin tools.
Supports cash payments, optional PayMongo checkout and Cloudinary coffee photos.

[Visit Caffeinawa](https://caffeinawa.pages.dev/)

## Setup

Use Node.js 24, pnpm 12.4.1 and PostgreSQL 17. From the repository root:

```sh
pnpm install --frozen-lockfile
cp -i apps/api/.env.example apps/api/.env
cp -i apps/web/.env.example apps/web/.env.local
```

Copy templates only on first setup; keep existing local configuration.
Set `DATABASE_URL`, `JWT_SECRET` and `WEB_URL` in `apps/api/.env`.
Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`, including `/api`.
See [API configuration](apps/api/README.md#environment) and
[web configuration](apps/web/README.md#environment) for optional integrations.
Never commit local environment files or credentials.

```sh
pnpm --filter @caffeinawa/types build
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy
pnpm dev
```

Review migrations and confirm the target development database before applying.
The storefront runs on `http://localhost:3000`; the API on `http://localhost:3001/api`.

## Workspace

- [apps/web](apps/web/README.md): Next.js/React storefront and admin screens.
- [apps/api](apps/api/README.md): NestJS API, Prisma and PostgreSQL.
- `packages/types`: shared API types and runtime constants.

## Checks

```sh
pnpm version:check
pnpm lint
pnpm test
pnpm build
pnpm typecheck
STATIC_EXPORT=true pnpm --filter web build
```

Database-backed tests need a separate test database; follow the
[API test instructions](apps/api/README.md#tests).

## Hosting

Cloudflare Pages hosts the static storefront; Render hosts the API with Neon
PostgreSQL. Cloudinary stores uploaded photos. Keep all services on their free
plans. API readiness: `/api/health/ready`.

## License

[MIT](LICENSE).
