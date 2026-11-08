# Studio-owned Stripe payment connections

Fixmit uses a studio-owned restricted API key, not Stripe Connect. Existing Amina credentials and webhook stay on their original configuration. Fixmit never receives the card number; Stripe Elements collects it directly.

## Configure a studio

Open Settings → Payments in the web app, or Studio → Payments in Fixmit Studio. Create a dedicated restricted API key in the studio's own activated Stripe account. Enter its `rk_` key and the matching `pk_` key into that authenticated form, never chat, source files, or URLs. Unrestricted `sk_` keys are rejected. Use sandbox keys first.

The third-party setup wizard can create a restricted key with Standard permissions for easier setup. Standard grants broader access; merchants can instead choose Custom and grant only the permissions below. Fixmit accepts restricted keys in both cases and never accepts unrestricted secret keys.

For Custom permissions:

- Account details: read (current account identity, currency and activation).
- Customers: write (find/create booking customers).
- Payment Intents: write (create, retrieve, cancel).
- Refunds: write (existing booking refund policies).
- Webhook endpoints: write (create/remove this studio's signed endpoint).

All other permissions, especially payouts and transfers, remain disabled. Where available, add a Stripe access policy restricting the key to the VPS's actual outbound IP (verify it; do not assume a public incoming address equals the outbound address). No Connect-platform permissions, subscriptions, or product management are used.

The connection checks account activation for live keys and read access to required payment resources without creating any payment/customer. Webhook creation verifies endpoint write access. Remaining write permissions must be validated with a sandbox booking/refund. The public key's mode is checked; the merchant must copy both keys from the same account.

## Security and tenant isolation

The database Credential.key contains public account metadata only. Credential.encryptedKey holds the restricted key and endpoint signing secret in authenticated AES-256-GCM ciphertext, with a random nonce and owner/account associated data. The root is domain-separated from CALENDSO_ENCRYPTION_KEY, which remains a runtime secret on the VPS. Database backups contain ciphertext; encrypted backups and tightly limited VPS access are still required. Root-key rotation requires re-encryption, not simply changing the environment variable.

Management routes require a session, same-origin JSON, a size limit and throttling. Owner identity always comes from the session. Generic credential updates cannot modify Stripe credentials. No key-reveal endpoint exists. Stripe exceptions and raw management requests must never be logged. Native key input exists only in memory, uses an ephemeral non-caching session, and is cleared after submission/dismissal; the web form does not use storage or autofill.

Each account is bound to one studio, including inactive history. The public random webhook selector is not an authentication secret: signatures are checked using only that studio's decrypted signing secret, then account/mode and persisted payment snapshots are checked. A key for another studio never falls back to Amina. Stripe retries on processing failure; fulfillment is idempotent using existing booking/payment locks. Existing booking amounts remain immutable snapshots.

Connecting and payment creation share an owner lock. Disconnect is refused while an active booking has an unsettled online payment, preventing removal of the webhook during payment processing. When safe, disconnect removes encrypted local access, marks the credential inactive and attempts remote endpoint removal. The studio should also revoke the dedicated key in Stripe. Reconnect the same account to preserve historical payments; changing to a different account is deliberately blocked.

## Service payments

Native service creation/editing supports payment at the studio, full online payment, or a fixed/percentage deposit, with the existing online balance link or studio settlement. Restricted connections support ON_BOOKING only; saved-card/no-show holds are excluded. Display-only/variable-price services remain without online payment until a positive fixed total is configured.

## Validation

Run checks only through the VPS runner with dummy development database URLs. Unit tests use synthetic credentials and signed fixture events, not real money. A full Stripe sandbox checkout must additionally verify initial deposit, signed delivery, online balance, confirmation emails, duplicate delivery, failed/processing payment, booking expiry, refund and disconnect/reconnect. Never claim this full external test from mocked unit tests alone.
