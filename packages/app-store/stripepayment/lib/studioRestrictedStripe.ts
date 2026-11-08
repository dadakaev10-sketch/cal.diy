import { randomBytes } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import Stripe from "stripe";
import { z } from "zod";
import { restrictedCredential } from "./bookingClient";
import { bookingCredentialSchema } from "./credentialSchema";
import { studioStripeConnection, studioStripeStatus } from "./studioConnection";
import { sealStripe } from "./studioStripeVault";

export const restrictedInput = z
  .object({
    apiKey: z.string().regex(/^rk_(test|live)_[A-Za-z0-9]{12,250}$/),
    publishableKey: z.string().regex(/^pk_(test|live)_[A-Za-z0-9]{12,250}$/),
  })
  .strict();
export async function connectRestrictedStripe(userId: number, input: z.infer<typeof restrictedInput>) {
  if (input.apiKey.split("_")[1] !== input.publishableKey.split("_")[1])
    throw ErrorWithCode.Factory.BadRequest("stripe_key_mode_mismatch");
  // Fail before creating anything at Stripe if the server cannot encrypt credentials.
  sealStripe({ apiKey: input.apiKey, webhookSecret: "whsec_probe" }, userId, "acct_probe");
  const client = new Stripe(input.apiKey, { apiVersion: "2020-08-27", maxNetworkRetries: 1 });
  const account = await client.accounts.retrieve();
  const liveMode = input.apiKey.startsWith("rk_live_");
  if (!account.id.startsWith("acct_") || (liveMode && !account.charges_enabled))
    throw ErrorWithCode.Factory.BadRequest("stripe_verification_required");
  if (account.id === process.env.FIXMIT_STRIPE_DIRECT_ACCOUNT_ID)
    throw ErrorWithCode.Factory.Forbidden("stripe_existing_direct_connection");
  // These read probes detect missing resources without creating a charge or customer.
  await Promise.all([
    client.customers.list({ limit: 1 }),
    client.paymentIntents.list({ limit: 1 }),
    client.refunds.list({ limit: 1 }),
  ]);
  const origin = new URL(process.env.WEBAPP_URL || "https://fixmit.com");
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw ErrorWithCode.Factory.BadRequest("stripe_connection_failed");
  let endpoint: Stripe.WebhookEndpoint | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73166, ${userId})`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73167, hashtext(${account.id}))`;
        const rows = await tx.credential.findMany({
          where: {
            appId: "stripe",
            type: "stripe_payment",
            OR: [{ userId }, { key: { path: ["stripe_user_id"], equals: account.id } }],
          },
          select: { id: true, userId: true, invalid: true, key: true },
        });
        if (rows.some((row) => row.userId !== userId))
          throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
        if (rows.some((row) => row.invalid !== true))
          throw ErrorWithCode.Factory.BadRequest("stripe_already_connected");
        const previous = rows.find(
          (row) => bookingCredentialSchema.safeParse(row.key).data?.stripe_user_id === account.id
        );
        if (!previous && rows.length)
          throw ErrorWithCode.Factory.BadRequest("stripe_account_change_not_allowed");
        const route = randomBytes(24).toString("hex");
        endpoint = await client.webhookEndpoints.create({
          url: `${origin.origin}/api/integrations/stripepayment/studio-webhook/${route}`,
          enabled_events: ["payment_intent.succeeded"],
          api_version: "2020-08-27",
          description: "Fixmit booking payments",
        });
        if (!endpoint.secret) throw ErrorWithCode.Factory.BadRequest("stripe_connection_failed");
        const encryptedKey = sealStripe(
          { apiKey: input.apiKey, webhookSecret: endpoint.secret },
          userId,
          account.id
        );
        const key = {
          stripe_user_id: account.id,
          default_currency: account.default_currency || "eur",
          stripe_publishable_key: input.publishableKey,
          fixmitConnection: "restricted",
          liveMode,
          webhookRoute: route,
          webhookEndpoint: endpoint.id,
        };
        if (previous)
          await tx.credential.update({
            where: { id: previous.id },
            data: { key, encryptedKey, invalid: false },
            select: { id: true },
          });
        else
          await tx.credential.create({
            data: { userId, appId: "stripe", type: "stripe_payment", key, encryptedKey, invalid: false },
            select: { id: true },
          });
      },
      { timeout: 30000, maxWait: 5000 }
    );
  } catch (error) {
    if (endpoint) await client.webhookEndpoints.del(endpoint.id).catch(() => undefined);
    throw error;
  }
  return studioStripeStatus(userId);
}
export async function disconnectRestrictedStripe(userId: number) {
  const connection = await studioStripeConnection(userId);
  if (!connection || connection.mode !== "restricted")
    throw ErrorWithCode.Factory.Forbidden("stripe_existing_direct_connection");
  const row = await restrictedCredential(connection.account);
  if (row.userId !== userId) throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73166, ${userId})`;
    const pending = await tx.payment.findFirst({
      where: {
        appId: "stripe",
        success: false,
        refunded: false,
        booking: { userId, status: { in: ["PENDING", "ACCEPTED"] } },
        data: { path: ["stripeAccount"], equals: connection.account },
      },
      select: { id: true },
    });
    if (pending) throw ErrorWithCode.Factory.BadRequest("stripe_pending_payments");
    const removed = await tx.credential.updateMany({
      where: { id: row.id, userId, encryptedKey: row.encryptedKey },
      data: { invalid: true, encryptedKey: null },
    });
    if (removed.count !== 1) throw ErrorWithCode.Factory.BadRequest("stripe_settings_changed");
  });
  // Remove local access first; failure to delete a remote endpoint must not retain the key.
  const client = new Stripe(row.secrets.apiKey, { apiVersion: "2020-08-27" });
  if (row.metadata.webhookEndpoint)
    await client.webhookEndpoints.del(row.metadata.webhookEndpoint).catch(() => undefined);
  return { disconnected: true };
}
