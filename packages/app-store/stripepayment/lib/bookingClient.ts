import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import Stripe from "stripe";
import { stripeBookingLiveMode } from "./bookingConfig";
import { bookingCredentialSchema } from "./credentialSchema";
import legacy from "./server";
import { openStripe } from "./studioStripeVault";

export const usesRestrictedKey = (account: string) => account !== process.env.FIXMIT_STRIPE_DIRECT_ACCOUNT_ID;
export async function restrictedCredential(account: string) {
  const row = await prisma.credential.findFirst({
    where: {
      appId: "stripe",
      type: "stripe_payment",
      userId: { not: null },
      OR: [{ invalid: false }, { invalid: null }],
      key: { path: ["stripe_user_id"], equals: account },
    },
    select: { id: true, userId: true, key: true, encryptedKey: true },
  });
  const parsed = bookingCredentialSchema.safeParse(row?.key);
  if (!row?.userId || !row.encryptedKey || !parsed.success || parsed.data.fixmitConnection !== "restricted")
    throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
  return {
    ...row,
    userId: row.userId,
    metadata: parsed.data,
    secrets: openStripe(row.encryptedKey, row.userId, account),
  };
}
export async function bookingClient(account: string) {
  if (!usesRestrictedKey(account)) return legacy;
  const row = await restrictedCredential(account);
  return new Stripe(row.secrets.apiKey, { apiVersion: "2020-08-27", maxNetworkRetries: 1 });
}
export async function bookingLiveMode(account: string) {
  if (!usesRestrictedKey(account)) return stripeBookingLiveMode();
  return (await restrictedCredential(account)).metadata.liveMode === true;
}
