# Restricted PayPal live payment test

Regular subscriptions keep PAYPAL_PLAN_ID and their existing pricing. For a temporary, account-specific live test, configure two **runtime-only** Coolify environment variables:

- PAYPAL_TEST_PLAN_ID: a separate live PayPal plan (USD 0.50 monthly, no trial, no setup fee).
- PAYPAL_TEST_EMAIL: the exact new Fixmit account email allowed to select that plan. Matching ignores case and surrounding whitespace.

The server reads the account email from the database; checkout requests cannot select a plan themselves. The billing page identifies the test price before opening PayPal. Existing grandfathered accounts keep access and do not need a subscription.

After the user finishes testing, clear PAYPAL_TEST_EMAIL and restart the app to disable new test checkouts. Keep PAYPAL_TEST_PLAN_ID while any test subscription exists so signed payment/cancellation webhooks continue to synchronize its access. Cancel the test subscription in PayPal to prevent another monthly USD 0.50 charge. Disabling the offer or deactivating a PayPal plan does not cancel an existing subscription.

Do not change production credentials, webhook registration, the regular plan, or the grandfathering cutoff for this test. Never complete the user's real payment on their behalf unless separately authorized.
