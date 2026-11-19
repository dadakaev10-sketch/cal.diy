# Complimentary Fixmit Pro for founding accounts

The owner requested permanent, free Pro for accounts registered by
2026-11-19 01:56:07 UTC (05:56:07 in Asia/Tbilisi).

Migration 20261119015607_studio_pro_grants freezes that cohort into
StudioProGrant. Grants have no expiry and no associated payment or renewal.
Later registrations do not receive a row. Account deletion removes its grant.

The production PayPal checkout excludes granted accounts through
requiresBilling. The prepared Studio Pro implementation reads the same grant,
returns legacy Pro with no expiry, and suppresses purchase readiness.
StudioProGrant is authoritative; an old StudioPlan.grandfathered seed flag
alone does not entitle a later account.

This does not enable paid checkout, publish the prepared iOS version, create
a subscription, or send any notification to users. A normal web deployment
applies the migration before the server starts.

Validation covers the cutoff boundary, idempotent grant insertion, exclusion
of future registrations, cascade deletion, checkout exclusion, and permanent
Pro rights without an active subscription.
