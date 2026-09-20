# DADAKAEV central scheduling platform

## Agreed direction

- Customer-facing origin: https://cal.apps.dadakaev.tech
- Hosting: existing VPS, managed exclusively through Coolify.
- Source: dadakaev10-sketch/cal.diy, upstream calcom/cal.diy.
- One platform serving multiple businesses, not one deployment per business.
- Initial environment is a test environment; no real customer data yet.
- Administrator email confirmed privately by the owner; supply it during protected provisioning, not as a committed default account.
- Email delivery is planned centrally through Resend with business-specific display names and reply-to addresses; optional business-owned delivery credentials can follow. No customer email delivery until configured and tested.
- Keep MIT copyright/license notices. Branding is configurable; final product name/logo are pending.

## Initial deployment state (2026-09-20; see release update below)

- Fork cloned at upstream commit 6bc45298226f96ff79e0c070c8b2ce39727e8477.
- Working branch: codex/central-platform-foundation.
- Read AGENTS.md and upstream deployment/startup configuration.
- VPS capacity checked: approximately 19 GiB available memory and 167 GiB free disk.
- Coolify project DADAKAEV-CAL / testing created with a dedicated private PostgreSQL database.
- Application UUID: 9puawzlwbkyvjcr4miryzpxx; database UUID: o3zsdgjfjiiww0gz3hxh9ht3.
- Protected test deployment at the agreed origin uses branch codex/central-platform-foundation, commit 19b939c.
- HTTPS verified; anonymous setup access returns 401. Authenticated setup responds successfully; public signup redirects to an error page.
- HTTP Basic Authentication is enabled; credentials are stored encrypted in Coolify application settings. No default account or customer data seeded.
- Initial administrator must complete the protected setup with the confirmed email and a privately chosen password.
- Automatic deployment is disabled for this unfinished development branch.
- Team availability membership authorization is hardened and unit-tested; full multi-tenant isolation remains incomplete.

## Security model to implement

Business is the tenant boundary. A personal user account is not sufficient to represent a business.

Roles:

- Platform administrator: provision/suspend businesses and invitations; cross-business access must be explicit and auditable.
- Business owner: manage only the assigned business and its staff, services and bookings.
- Staff member: assigned availability, calendar connections and permitted bookings.
- Public visitor: discover published services and book only a valid available slot; never access internal customer data.

Evaluate residual Team/Membership/schema code before deciding which structures to reuse. Presence of a database model does not establish that removed enterprise features are functional or secure.

Every protected read/write must enforce membership and ownership server-side. Never trust a client-supplied business ID alone. Scope invitations, bookings, event types, availability, calendar credentials, exports, API keys and background jobs. Decide and test multi-business membership explicitly.

## Implementation slices

1. Audit existing auth and ownership checks; map tenant-sensitive endpoints.
2. Add tenant/membership persistence and migrations, with explicit approval required by AGENTS.md.
3. Add authorization service and cross-tenant denial tests before customer management screens.
4. Implement administrator-created businesses and expiring single-use invitations; disable public signup.
5. Add business-owner and staff workflows for services and availability.
6. Integrate the public booking journey and outbound notifications.
7. Deploy a restricted test installation to Coolify and verify complete flows.

Keep changes small and reviewable. No wholesale replacement of existing authorization.

## Deployment requirements

- Dedicated PostgreSQL database and volume; no host-public database/admin-tool ports.
- Stable encryption/auth secrets stored only in Coolify, never in Git.
- Pin the tested application revision and database image version.
- HTTPS, correct canonical/auth URLs and healthchecks.
- No development seeds or known default administrator passwords.
- Protect the initial bootstrap; do not expose an unclaimed setup wizard publicly.
- Future Resend configuration must be business-scoped, encrypted at rest, owner-managed and never returned in plaintext or logs. Each business verifies its own sender domain. Do not fall back to another business's key.
- Account recovery and platform invitations need a separate platform-level sender policy; business booking email credentials must not determine platform authentication mail routing.
- Calendar providers require this application's own OAuth configuration and consent.
- Automated database backups plus protected encryption-key recovery and a tested restore.
- Define resource limits to protect other VPS workloads; no unapproved full monorepo build.

## Release gates

- Test businesses A and B cannot read or modify each other's records through any relevant API, URL or export.
- Staff cannot invite owners or gain global admin privileges.
- Concurrent booking attempts cannot create conflicting appointments.
- Time zones, DST, exceptions and cancellations work correctly.
- Notifications and password recovery are verified against a test mailbox before customer onboarding.
- Backup restoration succeeds in an isolated environment.
- Brand, terms, privacy and operational support expectations are confirmed before commercial onboarding.

## Implementation approval

The owner approved scoped Prisma schema changes, cross-package changes and full builds/E2E suites on 2026-09-20. Do not install unapproved new dependencies.

## First authorization hardening slice

- Reuse Team/Membership for a shared membership guard; no schema migration needed for this slice.
- Require accepted membership for team availability access, without implicit platform-admin bypass.
- Filter pending invitations out of member listings and counts.
- Reject invalid team IDs at the API boundary.
- Unit tests cover absent/pending membership, owner-only actions, invalid IDs and database failures.
- Handler regression tests verify denial before availability reads and accepted-only queries.
- This is not a complete tenant-isolation audit. Personal calendar data is still user-scoped upstream; multi-business staff accounts require an explicit isolation design before onboarding customers.

## Studio-owned Stripe integration (2026-09-20)

The owner requested direct use of each studio's own Stripe account, without a shared platform payment account. This is a new integration path, not a configuration change to the upstream Connect app. Commercial eligibility for a Georgia-operated hosted service remains a Stripe confirmation gate before live use; accepting customer keys is not proof of eligibility.

### Slice 1: implementation snapshot before deployment

- Test-only credential encryption helpers using AES-256-GCM, with authenticated binding to Team ID and immutable connection UUID. Tampering or copying encrypted configuration to a different studio/connection fails closed.
- Only restricted test keys are accepted; live keys and unrestricted secret keys are rejected. This is format validation, not remote account/permission verification.
- A separate 32-byte hex encryption key must be supplied by the future server configuration. No key has been generated, stored or deployed yet. Existing encryption and Connect credentials are untouched.
- EUR quotation helper: whole-number prepayment percentages from 0 to 100, cent rounding, total/due-now/remaining amounts, and a conservative 0.50 EUR minimum for nonzero prepayment. Initial scope is EUR services with EUR settlement; provider validation still applies.
- No database writes, Stripe calls, payment collection or public API/UI added in this slice.
- 33 focused unit tests pass, covering copied/tampered credentials, invalid keys, test-only enforcement and payment calculations.

### Remaining implementation slices

1. Add dedicated business-owned connection persistence and owner-only management APIs. Never put these secrets in upstream `Credential.key`, existing payment JSON, browser responses or logs. Return only connection status and masked metadata. Audit writes without secret values.
2. Verify the studio account and restricted-key permissions server-side. Prevent account reassignment on a connection with existing payments. Key rotation retains the connection/account identity. Provide recovery/rotation for the dedicated encryption key.
3. Add settings UI and service price/prepayment controls. Enforce accepted owner membership, CSRF protection and tenant-bound event ownership; do not infer a business from a staff user's personal connection.
4. Add direct-account Checkout/payment adapter without a global-key fallback or Connect `stripeAccount` header. Persist immutable connection ID and quoted amounts with each booking; compute amounts only from server-owned service data. Use idempotency and time-limited slot reservations.
5. Add per-connection signed webhooks and idempotent event processing. Validate amount, currency, payment ID, booking and connection against the persisted payment before confirmation. Handle expired/late payments without double booking or false confirmation. Basic Auth must not block the scoped signature-protected webhook route.
6. Integrate refunds, cancellation and reconciliation with the original payment connection. A different staff/owner or changed service configuration must never change the account used for an existing payment.
7. End-to-end test two isolated studios, concurrent bookings, retries, incorrect signatures, declined payments, refunds and key rotation. Use studio-authorized test credentials supplied through a secure configuration surface, never chat.
8. Obtain provider eligibility confirmation before enabling live keys. Keep the existing installation unchanged until the complete test flow is verified.

### Slice 2: implementation snapshot before deployment

- Added `MerchantStripeConnection` model and additive SQL migration. Encrypted payload is in a separate table, never upstream `Credential.key`. The relation prevents accidentally deleting a studio while a financial connection exists.
- Owner-only service verifies accepted Team membership before accessing status or contacting Stripe, and again inside the serializable save transaction. It reads the key's own Stripe account without a Connect account override and checks that its balance is test-mode.
- Updates preserve immutable account/connection IDs, allow key rotation for the same account, and increment a revision with the acting user ID. Status projections do not contain secrets or ciphertext.
- Added `/settings/my-account/studio-payments` and settings navigation. It lists only owned studios, accepts restricted test keys, clears secret inputs after save and returns safe errors. Platform administrators can create their own test studio here; assigning other owners remains separate work.
- Test publishable key is validated syntactically, not remotely paired. A webhook signing secret is optional during initial setup; actual webhook verification is still pending. The screen explicitly states that booking payments are NOT enabled.
- Server-side feature gate defaults off: `MERCHANT_STRIPE_TEST_ENABLED=true` is required. `MERCHANT_STRIPE_ENCRYPTION_KEY` must be a dedicated random 32-byte key encoded as 64 hex characters. Store it only in the protected runtime configuration and recovery backup; never commit it or reuse the general app encryption key.
- Before deployment: back up the dedicated test database, apply migration through the normal release process, configure the runtime secrets, then verify an authenticated owner/admin browser flow. No migration, server configuration or existing bookings have been changed by this development slice.
- Connection tests require real **sandbox/test** API credentials from the studio's Stripe dashboard, not sample strings. Initial verification needs Account and Balance read permission. Additional least-privilege Checkout/PaymentIntent permissions will be specified and tested with the checkout adapter; no unrestricted `sk_` key is accepted.
- A complete appointment/payment demo still requires slices 4–7 above. Do not tell customers that saving keys enables payment collection.

References: https://docs.stripe.com/keys-best-practices and https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts.

### Slice 3: isolated sandbox payment probe

- Owner-only hosted Checkout test at the studio payments settings screen. Test total and prepayment percentage are calculated on the server and stored before contacting Stripe. The fixed test scope is EUR, card-only, up to EUR 1,000 total; no real bookings or appointments are created.
- Separate `MerchantStripeTestCheckout` records retain the immutable connection, quotation, stable idempotency key, expiry, session and payment identity. Retries cannot silently change the studio or quotation. At most three unexpired test sessions per studio are allowed.
- Status is checked directly against the studio's Stripe account. Returning to the app is not payment confirmation. The server verifies test mode, session ID, client reference, connection metadata, currency and exact amount. Paid status is not downgraded by delayed events.
- A scoped signature-verified webhook is implemented at `/api/stripe/studio-test/{connectionId}`. Raw requests are limited to 256 KiB. Invalid signatures and cross-studio events fail closed; persistence failures remain retryable. No booking fulfillment is performed by this endpoint.
- Protected installations can use the authenticated manual status check without weakening Basic Auth. Public webhook exposure requires a separately reviewed proxy exception; do not remove application-wide protection.
- Unit tests use provider mocks, not actual Stripe credentials. A real Stripe sandbox test, including permission verification, remains a release gate. No live keys, real charges, customer emails or refunds have been enabled.
- The settings page still clearly distinguishes a successful technical test from an operational booking/payment integration. Public registration, owner invitations, verified mail delivery, booking reservations, refunds and commercial launch remain outstanding.

## Test operator steps

The slice snapshots above describe their original implementation stage. The migrations and runtime configuration have subsequently been deployed; see the release update below. Booking integration is still outstanding.

1. Sign in as the platform administrator and open Settings → Studio payments.
2. Create a Test Studio; this assigns the current administrator as its owner, not a different customer's account.
3. Save the studio's real sandbox account ID and restricted test credentials in the protected form, never in chat or Git. Initial Account/Balance reads and the Checkout permissions must be granted in that studio's sandbox.
4. Start a technical test, for example 2,000 cents and 50%. Complete hosted Checkout using Stripe's documented test card details only.
5. Return to settings and explicitly check payment status. Verify the matching EUR 10 test payment in the same studio's Stripe dashboard. A successful redirect alone is insufficient.
6. Repeat with a declined test card, an expired session and a second isolated studio before connecting the adapter to bookings.

## Protected sandbox release update (2026-09-20)

- Code revision `c11c1cd` includes slices 1–3 and starts the web workspace directly, preserving runtime-only integration configuration that Turbo's strict environment filter previously removed.
- Both additive merchant Stripe migrations have been applied to the dedicated test database. No existing booking/payment records were repurposed.
- A database backup was successfully restored into an isolated temporary database and checked, then that temporary database was removed.
- The dedicated encryption key is configured only at runtime, with a separate root-only recovery copy. Neither key material nor Stripe credentials are committed.
- Combined focused tests: 106 passing tests across nine files; full repository CI typecheck passes. Production image build passes. Provider calls in unit tests are mocked.
- HTTP Basic Authentication, disabled public signup and disabled auto-deploy remain in place. No live keys or real payments are enabled.
- Real studio sandbox credentials and an authenticated end-to-end checkout test are still required. Resend delivery, public studio registration, invitations, appointment reservations/payment fulfillment, cancellation/refunds and complete tenant-isolation verification remain release gates.
