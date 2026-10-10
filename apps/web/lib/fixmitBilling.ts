import { randomUUID } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { z } from "zod";
import { activePass } from "./fixmitPass";
import { accountReference, paypalConfig, paypalRequest } from "./fixmitPaypal";

export { paypalConfig, paypalRequest } from "./fixmitPaypal";

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
export function billingOffer() {
  const regularPlanId = paypalConfig().planId;
  const isTest = process.env.PAYPAL_USE_TEST_PLAN === "true";
  const testPlanId = process.env.PAYPAL_TEST_PLAN_ID;
  if (isTest && !testPlanId) throw unavailable();
  return { planId: isTest && testPlanId ? testPlanId : regularPlanId, isTest };
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
        ![paypalConfig().planId, process.env.PAYPAL_TEST_PLAN_ID].includes(sub.plan_id) ||
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
      const offer = billingOffer();
      const result = z.object({ id: z.string().regex(/^I-[A-Z0-9]+$/) }).parse(
        await paypalRequest("/v1/billing/subscriptions", {
          method: "POST",
          headers: { "PayPal-Request-Id": row.requestId },
          body: JSON.stringify({
            plan_id: offer.planId,
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
  if (await activePass(userId)) return true;
  let row = await readBilling(userId);
  if (row?.subscriptionId && (!row.checkedAt || Date.now() - row.checkedAt.getTime() > 300000))
    row = await syncBilling(userId);
  return hasBillingAccess(row);
}
