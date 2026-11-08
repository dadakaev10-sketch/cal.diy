import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { bookingClient, bookingLiveMode, restrictedCredential, usesRestrictedKey } from "./bookingClient";
import { assertStripeBookingAccount, stripeBookingEnabled } from "./bookingConfig";
import { bookingCredentialSchema } from "./credentialSchema";

export async function studioStripeConnection(userId: number, credentialId?: number) {
  const rows = await prisma.credential.findMany({
    where: {
      userId,
      appId: "stripe",
      type: "stripe_payment",
      OR: [{ invalid: false }, { invalid: null }],
      ...(credentialId ? { id: credentialId } : {}),
    },
    select: { id: true, key: true },
    orderBy: { id: "desc" },
  });
  for (const row of rows) {
    const parsed = bookingCredentialSchema.safeParse(row.key);
    if (!parsed.success) continue;
    const key = parsed.data;
    const direct = key.stripe_user_id === process.env.FIXMIT_STRIPE_DIRECT_ACCOUNT_ID;
    if (direct && String(userId) !== process.env.FIXMIT_STRIPE_DIRECT_USER_ID) continue;
    if (!direct && key.fixmitConnection !== "restricted") continue;
    return {
      id: row.id,
      account: key.stripe_user_id,
      currency: key.default_currency.toLowerCase() || "eur",
      mode: direct ? ("direct" as const) : ("restricted" as const),
      liveMode: key.liveMode === true,
    };
  }
  return null;
}
export async function assertStudioStripeOwner(account: string, userId: number | null | undefined) {
  if (!usesRestrictedKey(account)) {
    assertStripeBookingAccount(account, userId);
    return;
  }
  if (!userId) throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
  const connection = await studioStripeConnection(userId);
  if (!connection || connection.account !== account)
    throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
  if ((await restrictedCredential(account)).userId !== userId)
    throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
}
export async function studioStripeStatus(userId: number) {
  const connection = await studioStripeConnection(userId);
  let available = !!connection && (connection.mode === "restricted" || stripeBookingEnabled());
  let reason: string | null = available ? null : "stripe_payments_unavailable";
  if (connection?.mode === "restricted") {
    try {
      const account = await (await bookingClient(connection.account)).accounts.retrieve();
      available = account.id === connection.account && (connection.liveMode ? account.charges_enabled : true);
      if (!available) reason = "stripe_verification_required";
    } catch {
      available = false;
      reason = "stripe_status_unavailable";
    }
  }
  return {
    connected: !!connection,
    available,
    connectAvailable: !!process.env.CALENDSO_ENCRYPTION_KEY,
    credentialId: connection?.id ?? null,
    currency: connection?.currency ?? "eur",
    mode: connection?.mode ?? null,
    accountLabel: connection ? `Stripe · …${connection.account.slice(-4)}` : null,
    testMode: connection
      ? !(await bookingLiveMode(connection.account).catch(() => connection.liveMode))
      : false,
    reason,
  };
}
export async function requireStudioStripe(userId: number, credentialId?: number) {
  const connection = await studioStripeConnection(userId, credentialId);
  if (!connection) throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
  await assertStudioStripeOwner(connection.account, userId);
  return connection;
}
