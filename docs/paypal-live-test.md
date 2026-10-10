# Temporary PayPal live payment test price

The regular PayPal plan remains in PAYPAL_PLAN_ID. To offer all new accounts the temporary test price, configure two **runtime-only** Coolify environment variables:

- PAYPAL_TEST_PLAN_ID: a separate live PayPal plan (USD 0.50 monthly, no trial, no setup fee).
- PAYPAL_USE_TEST_PLAN=true: temporarily select that plan for new checkouts.

The server selects the plan; checkout requests cannot choose one themselves. The billing page identifies the test price before opening PayPal. Existing grandfathered accounts keep access and do not need a subscription. No account email configuration is needed.

After testing, set PAYPAL_USE_TEST_PLAN=false and restart the app to restore the regular offer. Keep PAYPAL_TEST_PLAN_ID while any test subscription exists so signed payment/cancellation webhooks continue to synchronize its access. Cancel the test subscription in PayPal to prevent another monthly USD 0.50 charge. Disabling the offer or deactivating a PayPal plan does not cancel an existing subscription.

Do not change production credentials, webhook registration, the regular plan, or the grandfathering cutoff for this test. Never complete the user's real payment on their behalf unless separately authorized.
