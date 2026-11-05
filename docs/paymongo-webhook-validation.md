# Signed PayMongo webhook validation

## Contract and settlement

The [formal event reference](https://docs.paymongo.com/docs/developer-tools-webhooks-events)
defines an event resource at `data.id`, `data.type=event` and `data.attributes`.
For `checkout_session.payment.paid`, the nested resource is a checkout session
with an order reference and a payments array. The handler requires exactly one
paid payment, a positive safe integer centavo amount, a three-letter currency,
and consistent intent/mode fields when present. Payment resource `type` is optional
because the Hosted Checkout example omits it; a supplied value must be `payment`.
Other failed attempts may coexist.

The [signature reference](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
uses HMAC-SHA256 over the timestamp, a dot and the exact raw request bytes. The
handler selects `te` or `li` from explicit `PAYMONGO_MODE`, checks a five-minute
clock tolerance, rejects duplicate active signature fields, then parses strict
UTF-8 JSON. The event's mode must match the configured endpoint mode.

The Hosted Checkout guide contains a different envelope illustration. The
handler does not invent a missing event identity or accept that shape without
provider delivery evidence. Signed unrelated event types are acknowledged without
settlement; only checkout-session paid events reach the payment transaction.

Settlement verifies the session/provider/order binding and the paid amount and
currency against the pending payment before claiming it. A mismatch leaves the
payment unpaid and creates an OPEN `PAYMENT_DETAILS_MISMATCH` reconciliation
issue outside the rolled-back transaction. A later valid delivery does not erase
that audit record. Duplicates retain the original `paidAt` and winning event ID.

Success is acknowledged after the database transaction commits. An unexpected
database failure returns a retryable error; this single-instance deployment has
no durable background queue that would justify acknowledging before persistence.
Store closure or disabled new PayMongo checkout does not block valid settlement.

## Verification command

Credentials stay in secure local environment storage. Normal `DATABASE_URL`
continues to target `caffeinawa`; each database-backed command below receives the
exact `TEST_DATABASE_URL` only for that command. The runner also requires a local
host and a database name containing `test`.

```sh
pnpm --filter @caffeinawa/types build
pnpm --filter api exec prisma generate
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api exec prisma migrate deploy
pnpm --filter api build
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api webhook:verify --self-test
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter api webhook:verify
```

`--self-test` sends two locally signed HTTP requests and verifies committed,
idempotent settlement. It does not contact PayMongo or start a tunnel. CI runs
this mode and verifies that the normal database URL is rejected before startup.

The interactive mode requires `cloudflared`, a securely configured `sk_test_`
key and `PAYMONGO_MODE=test`. It starts a temporary HTTPS tunnel exposing only the
webhook path; all other routes return 404. It waits for the hostname to become
reachable, registers a separate temporary test webhook and retains its signing
secret only in process memory. Existing webhook configuration and environment
files are unchanged.

Interactive verification creates one QR Ph sandbox checkout using the official
PayMongo API and binds it to the isolated payment. It never retries session
creation after failure. Open the printed checkout URL and use only PayMongo's
test simulator. **Do not scan the QR with a bank or wallet app:** the
[testing reference](https://docs.paymongo.com/docs/payment-acceptance-testing) warns
that even a test-mode QR can process a real transaction.

The runner checks one genuine signed paid delivery and then replays that
authenticated event directly through settlement to verify unchanged state. It
reports the provider delivery and local replay separately. It disables and
deletes its temporary webhook, stops its tunnel and removes its own test
fixtures on completion, interruption or a 15-minute timeout. An unpaid known
sandbox session is expired; a paid test record remains in the provider account.
If a creation response is ambiguous, review the printed sandbox order reference
in the Dashboard; do not repeat creation for that reference.

The Dashboard Test Events sample received on November 5, 2026 had a valid
signature and the formal event envelope, but its payment contained status and
fees without amount or currency. Rejecting that incomplete sample is intentional;
line items and fees are not proof of a matching paid amount. The Dashboard sample
is therefore not a positive settlement test.

The registered test-account webhook inspected during this work did not target
the current Render API webhook URL. It was left unchanged. Production remains
closed and cash-only; endpoint registration, signing-secret configuration and
merchant test-mode delivery must be verified before enabling payment acceptance.

## Current evidence

- Local raw HTTP signature, settlement and duplicate self-test passed.
- Database tests cover amount/currency mismatches, tampering, mode confusion,
  concurrent duplicates, cancelled-order rollback and recovery after a database
  failure before commit.
- A genuine signed Dashboard sample reached the handler and was rejected for
  missing paid amount/currency evidence.
- On November 5, 2026, one official sandbox QR Ph checkout was completed using
  PayMongo's simulator URL. Its genuine signed paid event passed the formal
  envelope validator, matched PHP 250.00, and committed PAID / CONFIRMED state in
  the isolated local test database. A local replay of that authenticated event
  preserved the winning event ID and timestamp. This was one provider delivery
  plus one local service replay, not two provider deliveries.
- The temporary webhook was disabled and deleted; its tunnel stopped and owned
  local fixtures were removed. The paid sandbox record remains at the provider.
  No production order, real transfer, or infrastructure change was required.
