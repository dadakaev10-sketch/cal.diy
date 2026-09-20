# Studio account recovery and email-first registration

## Scope and status

This slice implements password recovery, email-first studio registration, and administrator invitations. It does not complete public booking access, booking email integration, or studio payment/deposit processing.

- `/recover` requests a password link. `/recover/<token>` chooses a replacement password.
- `/register` first requests email ownership verification. `/register/verify?token=...` then asks the verified owner for their name, studio, booking address, timezone, and password.
- `/studio-admin` invites a new studio owner. Its page and API check the live administrator role, two-factor authentication, and current password/session stamp. Existing accounts are never overwritten.
- `STUDIO_REGISTRATION_ENABLED=true` enables the new request and completion endpoints and registration form. Keep this false until the migration and acceptance checks pass. `STUDIO_ACCESS_GATE_ENABLED=true` remains required for the protected testing platform.
- New studios receive a separate team and exactly one accepted OWNER membership. Owners are ordinary platform users, never platform administrators. A blank availability schedule is deliberate: owners choose their opening hours before publishing bookings.

## Security properties

Tokens have 256 bits of randomness, a one-hour lifetime, and are stored only as SHA-256 hashes. Registration does not collect or store a password until email ownership has been proved. Token consumption, user/schedule/team creation, and owner assignment share one transaction. PostgreSQL advisory locking protects studio slug claims within this flow; existing upstream profile/slug editing still needs to be considered in the future public-booking audit.

Password changes lock the account row, claim an unexpired token, change the password, and remove the account's other reset links in one transaction. Concurrent reset attempts cannot both succeed. Locked and non-password-provider accounts are ineligible. A reset does not disable 2FA, change identity providers, or alter platform roles.

Credential sessions carry a server-created HMAC stamp of the password hash actually checked during login. The studio gate checks it on protected requests. All pre-rollout sessions require login again, and password changes revoke old sessions. Never remove the stamp validation as a workaround for an old session.

Public account writes require an exact configured Origin and JSON, accept at most 16 KiB, and use persistent HMAC-IP counters (20 attempts / 10 minutes). Email requests additionally use HMAC-email counters (3 / 10 minutes) before account lookup. Database/secret failures deny requests. Completion/reset requires a matching nonempty CSRF cookie. Forms use POST and remain disabled until their client handlers are ready.

Email delivery is awaited in strict mode. A send failure removes only that newly created request and logs a fixed event code without tokens, recipient addresses, or SMTP errors. Public responses are neutral for unknown, existing, throttled-by-email, and undeliverable addresses; they do not claim successful delivery. This is not a durable mail outbox; a user retries after a transient delivery failure. Successful SMTP acceptance does not guarantee inbox delivery.

## Migration and release

1. Capture the current deployed commit and take a fresh database backup.
2. Deploy additive migration `20260920150000_studio_registration_request` before enabling registration.
3. Deploy the reviewed account changes and branded account emails. Preserve the trusted ingress, existing secret values, and runtime-only Resend key. Keep auto-deploy off.
4. Verify `/`, `/auth/login`, `/recover`, and `/register` load with no browser authentication challenge. Check private pages redirect and private APIs return 401; upstream bootstrap/signup remain 404.
5. Enable `STUDIO_REGISTRATION_ENABLED` only for the intended testing rollout. Check both languages, expired links, forged sessions, replay rejection, and private API denial.
6. The owner can exercise delivery with their own address. Do not reset their password, fabricate an administrator session, or send unsolicited preview emails as a deployment test.

Rollback to the previous app-gate commit is safe with registration disabled; keep the additive table. Old sessions might need another login. Rollback to any code before the app gate requires restoring Basic Auth first. Unexpired links from this slice will not work on a previous revision; issue fresh links after recovery.

## Validation

Unit tests cover input/CSRF/origin restrictions, eligibility, failed delivery, rate-limit failure, reserved/taken slugs, token claim failure, owner assignment, and administrator authorization. Integration tests use an explicitly isolated local PostgreSQL database on port 55439 and refuse other URLs. They exercise concurrent registration, simultaneous resets using the same and different links, rollback after team-creation failure, and parallel persistent rate limiting.

Run the relevant unit tests with the repository Yarn launcher. For integration, initialize a disposable local PostgreSQL database from the Prisma schema and set both DATABASE_URL and STUDIO_AUTH_TEST_DATABASE_URL to that isolated database; run with VITEST_MODE=integration. Never point these tests at the live database.
