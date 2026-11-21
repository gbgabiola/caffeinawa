# Changelog

Project versions follow [Semantic Versioning](https://semver.org/). The root and
private workspace packages share one version. See [the versioning policy](docs/versioning.md).

## [Unreleased]

No changes recorded yet.

## [0.1.0] - 2026-11-22

First project-wide versioned development baseline. This section summarizes the
existing Git history; it does not invent earlier releases or imply that all
features were introduced on this date.

### Added

- Coffee menu browsing, search/category filters, cart controls and customer accounts.
- Authenticated customer order history and account/profile management.
- Admin coffee, customer, order, payment and reconciliation workflows.
- Cash checkout and a gated PayMongo QR Ph hosted-checkout integration.
- Persistent store opening/closure controls and advertised payment capabilities.
- Responsive cafe storefront, accessible form associations and route recovery pages.
- CI checks for unit/component tests, database-backed API tests, types, lint, builds
  and static storefront export.

### Reliability and security

- Explicit public customer responses, validated JWT claims/expiry and constrained algorithms.
- Authentication rate limits using the configured Render edge client-IP contract.
- Decimal money calculations, bounded cart quantities and serialized cart mutations.
- Durable checkout idempotency and recovery after lost responses or cart changes.
- One-attempt PayMongo session creation, validated/timeout-bounded provider calls,
  saved-session recovery and committed-order references after checkout failures.
- Signed webhook validation, amount/currency matching, conditional payment/order
  settlement, preserved duplicate timestamps and durable reconciliation issues.
- Fail-closed database selection at E2E configuration startup, with regression
  coverage and authentication fixture cleanup (TEST-001, PR #8).

### Release limitations

- This is a development baseline, not a declaration of production readiness.
- At baseline review the deployed store is closed, advertises cash only, and has
  PayMongo checkout disabled; its configured webhook is in test mode.
- SEC-001 (the affected API request-parser dependency) remains open. Broader
  dependency advisory triage and operational release/recovery acceptance remain.
- Paid cancellation does not perform an automatic refund. Ambiguous provider
  creation requires operator review; it is never repeated automatically.

[Unreleased]: https://github.com/gbgabiola/caffeinawa/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gbgabiola/caffeinawa/tree/v0.1.0
