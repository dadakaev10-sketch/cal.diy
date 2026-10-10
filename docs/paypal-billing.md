# Fixmit PayPal subscriptions

The checkout is /billing (also linked in the account menu). New accounts register and sign in before subscribing. Existing accounts created before FIXMIT_BILLING_REQUIRED_FROM and administrators retain access without payment.

## Runtime configuration (Coolify)

- FIXMIT_BILLING_ENABLED=true only after all settings below are verified.
- FIXMIT_BILLING_REQUIRED_FROM: ISO UTC rollout timestamp. Preserve this value on every later deployment.
- PAYPAL_ENVIRONMENT=live (sandbox only for isolated tests).
- PAYPAL_CLIENT_ID: public client identifier for the same merchant app that owns the plan.
- PAYPAL_CLIENT_SECRET: private runtime-only credential; never NEXT_PUBLIC or a build argument.
- PAYPAL_PLAN_ID=P-8RG18413YP243733UNLE6KDI
- PAYPAL_WEBHOOK_ID: live webhook registered on that same PayPal app.
- NEXTAUTH_SECRET and NEXTAUTH_URL must remain unchanged.

Webhook URL: https://fixmit.com/api/fixmit-billing/webhook
Subscribe to BILLING.SUBSCRIPTION.ACTIVATED, UPDATED, CANCELLED, SUSPENDED, EXPIRED, PAYMENT.FAILED and PAYMENT.SALE.COMPLETED.
The approved plan is USD 9 monthly, one free 14-day trial, no setup fee. Verify the remote plan before enabling checkout.

## Security and lifecycle

The server creates subscriptions using a stable PayPal request ID and an HMAC-bound account reference. The browser cannot select the user, plan or subscription ID to activate. Approval causes server-side verification and retry polling. A unique database constraint prevents reusing a subscription across accounts. Webhooks are verified through PayPal and then fetch current subscription state, making duplicate/out-of-order deliveries safe.

Access lasts only until the remotely verified next billing time. Cancellation preserves the previously verified trial/paid period. Suspended and expired subscriptions deny access. Failed renewal cannot extend the prior entitlement. Active state is refreshed at most every five minutes on access, so missed webhooks do not leave permanent access. Verification failures fail closed; the billing screen remains reachable.

The access gate covers dashboard/API access. Public booking creation checks the event's actual user or team owners; unpaid profiles are unavailable. Existing guest cancellation links remain available.

The FixmitSubscription table is added by the normal Prisma deployment migration. Rollback can disable FIXMIT_BILLING_ENABLED without deleting billing records.

## Deliberate limits / remaining live validation

A cancelled/expired subscription is not silently replaced with another free trial. Returning subscribers require support and a separately approved no-trial renewal path. No live payment is initiated by automated tests. Verify live merchant credentials and webhook configuration before release. Use a sandbox merchant and buyer to exercise the complete payment flow without real charges. The client button alone does not enable billing.

Tests: account/plan/ID mismatches; idempotent create; revoked/expired/failed-renewal access; grandfathering; authenticated activation; forged/duplicate webhooks; individual/team booking checks; migration uniqueness and cascade in disposable PostgreSQL.
