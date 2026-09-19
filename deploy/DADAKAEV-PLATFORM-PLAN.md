# DADAKAEV central scheduling platform

## Agreed direction

- Customer-facing origin: https://cal.apps.dadakaev.tech
- Hosting: existing VPS, managed exclusively through Coolify.
- Source: dadakaev10-sketch/cal.diy, upstream calcom/cal.diy.
- One platform serving multiple businesses, not one deployment per business.
- Initial environment is a test environment; no real customer data yet.
- Administrator email confirmed privately by the owner; supply it during protected provisioning, not as a committed default account.
- Email delivery will be configured later via a separate Resend API key per business. No customer email delivery until configured.
- Keep MIT copyright/license notices. Branding is configurable; final product name/logo are pending.

## Current state (2026-09-20)

- Fork cloned at upstream commit 6bc45298226f96ff79e0c070c8b2ce39727e8477.
- Working branch: codex/central-platform-foundation.
- Read AGENTS.md and upstream deployment/startup configuration.
- VPS capacity checked: approximately 19 GiB available memory and 167 GiB free disk.
- No new production service, database, credentials or customer accounts created.
- No tenant isolation implementation or security verification completed yet.

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
