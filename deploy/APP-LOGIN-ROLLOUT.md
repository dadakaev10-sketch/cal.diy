# Studio application login rollout

## Scope

Replace the browser Basic Auth challenge with the existing NextAuth login form. This is a protected testing platform, not an open customer launch.

- `STUDIO_ACCESS_GATE_ENABLED=true` requires a valid encrypted application session and an existing, unlocked user for non-public routes.
- Public routes are explicitly enumerated. Anonymous API requests return JSON 401 without `WWW-Authenticate`; private pages redirect to `/auth/login`.
- Bootstrap and upstream signup endpoints are closed even when a token parameter is supplied. `/signup` redirects to the registration status page.
- Credentials attempts are limited to 20 per ten-minute window per proxy-provided IP. Counters use HMAC identifiers in PostgreSQL; entries older than one day are removed on subsequent credential attempts. The database must be available; failures deny the attempt.
- The application container must not have a publicly exposed port. The trusted Coolify proxy must replace untrusted forwarded IP headers.
- Existing NextAuth CSRF, password and two-factor handling remain in place. This boundary supplements, not replaces, per-studio membership checks.

## Deployment order

1. Back up the database; deploy the additive `StudioAuthThrottle` migration and code while retaining Basic Auth.
2. Configure the runtime gate flag and existing HTTPS `NEXTAUTH_URL`/`NEXTAUTH_SECRET`.
3. Using Basic Auth only (no application session), verify login and registration pages return 200, bootstrap returns 404, internal APIs return 401, private pages redirect, and invalid session cookies are rejected.
4. Only then remove the Basic Auth proxy labels and switch off the Coolify Basic Auth flag. Keep signup disabled and auto-deploy off.
5. Verify in a fresh browser: no browser challenge, normal login form, invalid-password feedback, complete assets, and protected studio routes.

**Rollback:** re-enable the saved Basic Auth configuration before deploying any revision that lacks the application gate. Never roll back to an unguarded revision while the proxy protection is off.

## Not delivered by this slice

The `/register` page is an explicit availability/status page, not account creation. Public studio signup, verified email ownership, owner provisioning, password recovery, email delivery and the full tenant-isolation audit are still outstanding. No email sender or Resend credential is currently configured. Do not represent the registration UI as a working registration flow.

Successful sign-in with the owner's private password must be checked by the owner; do not manufacture a session or expose credentials to complete that check.
