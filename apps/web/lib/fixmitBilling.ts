import { createHmac, randomUUID } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { z } from "zod";

const paypalSubscription = z.object({
  id: z.string(),
  plan_id: z.string(),
  custom_id: z.string(),
  status: z.enum(["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]),
  billing_info: z
    .object({
      next_billing_time: z.string().datetime().optional(),
      failed_payments_count: z.number().optional(),
    })
    .optional(),
});
type Subscription = z.infer<typeof paypalSubscription>;
const unavailable = () => ErrorWithCode.Factory.InternalServerError("Billing unavailable");
export type BillingRow = {
  userId: number;
  requestId: string;
  subscriptionId: string | null;
  status: string;
  accessUntil: Date | null;
  checkedAt: Date | null;
  createdAt: Date;
};
export function billingEnabled() {
  return process.env.FIXMIT_BILLING_ENABLED === "true";
}
export function paypalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const planId = process.env.PAYPAL_PLAN_ID;
  if (!clientId || !secret || !planId) throw unavailable();
  return {
    clientId,
    secret,
    planId,
    base:
      process.env.PAYPAL_ENVIRONMENT === "sandbox"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com",
  };
}
export async function paypalRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const config = paypalConfig();
  const tokenResponse = await fetch(`${config.base}/v1/oauth2/token`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) throw unavailable();
  const token = z.object({ access_token: z.string() }).parse(await tokenResponse.json());
  const result = await fetch(`${config.base}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
  });
  if (!result.ok) throw unavailable();
  return result.status === 204 ? {} : result.json();
}
function accountReference(userId: number) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw unavailable();
  return createHmac("sha256", secret).update(`fixmit-paypal:${userId}`).digest("hex");
}
export function subscriptionAccess(subscription: Subscription, previous: Date | null, now = new Date()) {
  if (subscription.status === "CANCELLED") return previous;
  if (subscription.status !== "ACTIVE") return null;
  if ((subscription.billing_info?.failed_payments_count || 0) > 0) return previous;
  const until = subscription.billing_info?.next_billing_time;
  if (!until) return null;
  const date = new Date(until);
  // This plan is monthly: reject unexpected remote entitlement durations.
  return date > now && date.getTime() < now.getTime() + 35 * 86400000 ? date : null;
}
export function hasBillingAccess(row: BillingRow | undefined, now = new Date()) {
  return !!row && ["ACTIVE", "CANCELLED"].includes(row.status) && !!row.accessUntil && row.accessUntil > now;
}
export async function readBilling(userId: number) {
  const rows = await prisma.$queryRaw<
    BillingRow[]
  >`SELECT * FROM "FixmitSubscription" WHERE "userId" = ${userId}`;
  return rows[0];
}
export async function syncBilling(userId: number) {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        BillingRow[]
      >`SELECT * FROM "FixmitSubscription" WHERE "userId" = ${userId} FOR UPDATE`;
      const row = rows[0];
      if (!row?.subscriptionId) return row;
      const sub = paypalSubscription.parse(
        await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(row.subscriptionId)}`)
      );
      if (
        sub.id !== row.subscriptionId ||
        sub.plan_id !== paypalConfig().planId ||
        sub.custom_id !== accountReference(userId)
      )
        throw ErrorWithCode.Factory.Forbidden("Subscription mismatch");
      const until = subscriptionAccess(sub, row.accessUntil);
      const checked = new Date();
      await tx.$executeRaw`UPDATE "FixmitSubscription" SET "status" = ${sub.status}, "accessUntil" = ${until}, "checkedAt" = ${checked} WHERE "userId" = ${userId}`;
      return { ...row, status: sub.status, accessUntil: until, checkedAt: checked };
    },
    { timeout: 30000 }
  );
}
export async function createBilling(userId: number) {
  await prisma.$executeRaw`INSERT INTO "FixmitSubscription" ("userId", "requestId") VALUES (${userId}, ${randomUUID()}) ON CONFLICT ("userId") DO NOTHING`;
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        BillingRow[]
      >`SELECT * FROM "FixmitSubscription" WHERE "userId" = ${userId} FOR UPDATE`;
      const row = rows[0];
      if (row.subscriptionId) {
        if (row.status !== "APPROVAL_PENDING")
          throw ErrorWithCode.Factory.BadRequest("Subscription already exists");
        return row.subscriptionId;
      }
      // Never retry an ambiguous create after PayPal's idempotency retention window.
      if (Date.now() - row.createdAt.getTime() > 70 * 3600000) throw unavailable();
      const result = z.object({ id: z.string().regex(/^I-[A-Z0-9]+$/) }).parse(
        await paypalRequest("/v1/billing/subscriptions", {
          method: "POST",
          headers: { "PayPal-Request-Id": row.requestId },
          body: JSON.stringify({
            plan_id: paypalConfig().planId,
            custom_id: accountReference(userId),
            application_context: {
              brand_name: "Fixmit",
              shipping_preference: "NO_SHIPPING",
              user_action: "SUBSCRIBE_NOW",
            },
          }),
        })
      );
      await tx.$executeRaw`UPDATE "FixmitSubscription" SET "subscriptionId" = ${result.id}, "status" = 'APPROVAL_PENDING' WHERE "userId" = ${userId}`;
      return result.id;
    },
    { timeout: 30000 }
  );
}
export async function requiresBilling(userId: number) {
  if (!billingEnabled()) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, createdDate: true },
  });
  if (!user) return true;
  if (user.role === "ADMIN") return false;
  const cutoff = process.env.FIXMIT_BILLING_REQUIRED_FROM;
  if (!cutoff || !Number.isFinite(Date.parse(cutoff))) throw unavailable();
  return user.createdDate >= new Date(cutoff);
}
export async function entitled(userId: number) {
  if (!(await requiresBilling(userId))) return true;
  let row = await readBilling(userId);
  if (row?.subscriptionId && (!row.checkedAt || Date.now() - row.checkedAt.getTime() > 300000))
    row = await syncBilling(userId);
  return hasBillingAccess(row);
}
