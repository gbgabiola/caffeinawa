# Project versioning

## Current baseline

Caffeinawa starts its project-wide version history at **0.1.0**. Before this
baseline there were no version tags; the API, web and types package versions were
inconsistent scaffold defaults. Existing features and the reliability work in
Git history justify an initial development baseline, not an arbitrary version
based on commit or PR counts.

Version 0.x indicates initial development. Version 1.0.0 is reserved for an
accepted product/API scope and satisfied release gates, including security and
operational readiness. A version tag identifies source; it does not certify a
live deployment, merchant activation or production readiness.

## One version for the private monorepo

The root `package.json` is the project version source of truth. The following
private workspace manifests must match it:

- `apps/api/package.json`
- `apps/web/package.json`
- `packages/types/package.json`

Run `pnpm version:check` to verify manifest consistency and the current changelog
entry. CI runs the same dependency-free check before installation.

Keep their existing package names and `workspace:*` dependencies. These packages
are not published to npm. A project version does not change HTTP route prefixes
or the database migration numbering scheme.

## Choosing the next version

Use [Semantic Versioning](https://semver.org/) and the actual merged changes:

- While 0.x, use a patch increment for compatible fixes or maintenance releases;
  use a minor increment for a new capability milestone or incompatible contract
  change. Document breaking changes explicitly.
- After 1.0.0, compatible fixes increment PATCH, compatible features increment
  MINOR and incompatible public contract changes increment MAJOR.
- Use an explicit prerelease suffix when preparing a candidate for a planned
  release. Do not derive versions from the number of commits, PRs or deployments.
- Normal feature/fix branches do not bump versions automatically. A focused
  release-preparation PR updates the four manifests and changelog together.

## Release procedure

1. Start a release-preparation branch from current `main` with a clean tree.
2. Set the reviewed version in the root and all private workspace manifests.
3. Move the approved change summary from Unreleased into a dated changelog entry;
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
