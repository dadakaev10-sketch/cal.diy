# Public customer booking links

Customers can open personal profile/event links and book without a studio account. The studio access gate remains enabled for the owner application, settings, administrators and internal APIs.

The gate permits the existing public booking pages, high-entropy booking/reschedule/cancel links, avatars and image rendering. An explicit procedure allowlist enables only the booking calendar, public event details, translation/timezone/feature data, slot reservations and guest email verification. Read batches must contain only allowed procedures; mutation batches are rejected. Booking creation and cancellation retain their existing handler validation. Anonymous guests require no session; when a valid JWT is present, public booking APIs also verify its current password stamp so revoked sessions cannot retain account privileges. Public writes require the configured Origin and JSON; persistent IP throttles fail closed. No payment routes, private booking lists or administrator operations are opened.

The static-route coverage test guards against treating application pages as public usernames. Personal profile and event links are covered; organization/team/routing-form/payment routes remain outside this release.

Validation: boundary tests, full typecheck, isolated local browser booking from calendar through confirmation, guest cancellation and private API denial. Browser tests use a disposable database with mail delivery suppressed. Production verification must use a fresh anonymous browser and stop before submitting a real booking.
