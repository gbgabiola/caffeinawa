# Contributing

## Scope and branches

Audit/planning work is read-only. For authorized implementation, use a
short-lived descriptive branch from current `main`: `fix/...`, `test/...`,
`security/...`, `feat/...`, `chore/...`, `docs/...`, `refactor/...` or `perf/...`.
A permanent `develop` branch is not required. Preserve unrelated local changes
and keep each branch focused on one approved task.

## Complete the Git workflow

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

## Validation and releases

Use the root pnpm workspace. Build shared types when their source changes.
Database-backed tests require command-scoped `DATABASE_URL="$TEST_DATABASE_URL"`,
exact URL equality and a database name containing `test`; never permanently
replace the normal URL. See [API test instructions](apps/api/README.md#run-tests).

Follow [project versioning](docs/versioning.md) and update [the changelog](CHANGELOG.md)
for a release. Publishing a tag does not authorize enabling ordering, live
payments, new paid services or a separate production rollout.
