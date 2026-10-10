import { randomUUID } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { z } from "zod";
import { accountReference, paypalRequest } from "./fixmitPaypal";
export const PASS_AMOUNT = "0.50";
export type PassRow = {
  requestId: string;
  userId: number;
  orderId: string | null;
  captureId: string | null;
  status: string;
  accessUntil: Date | null;
  checkedAt: Date | null;
  createdAt: Date;
};
const amount = z.object({
  currency_code: z.literal("USD"),
  value: z.string().refine((v) => /^0\.50$/.test(v)),
});
const orderSchema = z.object({
  id: z.string(),
  intent: z.literal("CAPTURE"),
  status: z.string(),
  purchase_units: z
    .array(
      z.object({
        custom_id: z.string(),
        amount,
        payments: z.object({ captures: z.array(z.object({ id: z.string() })) }).optional(),
      })
    )
    .length(1),
});
const captureSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount,
  create_time: z.string().datetime(),
  supplementary_data: z.object({ related_ids: z.object({ order_id: z.string() }) }),
});
export function passExpiry(captureTime: string, now = new Date()) {
  const paid = new Date(captureTime);
  if (!Number.isFinite(paid.getTime()) || paid.getTime() > now.getTime() + 300000)
    throw ErrorWithCode.Factory.Forbidden("Invalid payment time");
  return new Date(paid.getTime() + 30 * 86400000);
}
export async function createPass(userId: number) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      const previous = await tx.$queryRaw<
        PassRow[]
      >`SELECT * FROM "FixmitPass" WHERE "userId" = ${userId} ORDER BY "createdAt" DESC LIMIT 1`;
      const row = previous[0];
      if (row?.status === "COMPLETED" && row.accessUntil && row.accessUntil > new Date())
        throw ErrorWithCode.Factory.BadRequest("Access already active");
      if (row?.status === "PENDING") throw ErrorWithCode.Factory.BadRequest("Payment pending");
      const pending = row && ["NEW", "CREATED", "APPROVED", "PAYER_ACTION_REQUIRED"].includes(row.status);
      if (pending && Date.now() - row.createdAt.getTime() > 5 * 3600000 && !row.orderId)
        throw ErrorWithCode.Factory.InternalServerError("Ambiguous order requires support");
      if (pending && row.orderId && Date.now() - row.createdAt.getTime() < 3 * 3600000) return row.orderId;
      const requestId = pending && !row.orderId ? row.requestId : randomUUID();
      if (requestId !== row?.requestId)
        await tx.$executeRaw`INSERT INTO "FixmitPass" ("requestId", "userId") VALUES (${requestId}, ${userId})`;
      const base = new URL(process.env.NEXTAUTH_URL || "https://fixmit.com").origin;
      const created = z
        .object({ id: z.string().regex(/^[A-Z0-9]+$/) })
        .parse(
          await paypalRequest("/v2/checkout/orders", {
            method: "POST",
            headers: { "PayPal-Request-Id": requestId },
            body: JSON.stringify({
              intent: "CAPTURE",
              purchase_units: [
                {
                  custom_id: accountReference(userId),
                  description: "Fixmit — 30 days access, no renewal",
                  amount: { currency_code: "USD", value: PASS_AMOUNT },
                },
              ],
              payment_source: {
                paypal: {
                  experience_context: {
                    brand_name: "Fixmit",
                    landing_page: "GUEST_CHECKOUT",
                    shipping_preference: "NO_SHIPPING",
                    user_action: "PAY_NOW",
                    return_url: `${base}/billing?purchase=one-time`,
                    cancel_url: `${base}/billing?purchase=one-time`,
                  },
                },
              },
            }),
          })
        );
      await tx.$executeRaw`UPDATE "FixmitPass" SET "orderId" = ${created.id}, "status" = 'CREATED' WHERE "requestId" = ${requestId}`;
      return created.id;
    },
    { timeout: 30000 }
  );
}
export async function syncPass(orderId: string, userId?: number, capture = false) {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        PassRow[]
      >`SELECT * FROM "FixmitPass" WHERE "orderId" = ${orderId} FOR UPDATE`;
      const row = rows[0];
      if (!row || (userId !== undefined && row.userId !== userId))
        throw ErrorWithCode.Factory.Forbidden("Order mismatch");
      if (["REFUNDED", "REVERSED"].includes(row.status)) return row;
      let order = orderSchema.parse(
        await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`)
      );
      const validate = () => {
        if (order.id !== row.orderId || order.purchase_units[0].custom_id !== accountReference(row.userId))
          throw ErrorWithCode.Factory.Forbidden("Order mismatch");
      };
      validate();
      if (capture && order.status === "APPROVED") {
        await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
          method: "POST",
          headers: { "PayPal-Request-Id": `${row.requestId.slice(0, 28)}-capture` },
          body: "{}",
        });
        order = orderSchema.parse(await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`));
        validate();
      }
      let until: Date | null = null;
      let captureId = row.captureId;
      let status = order.status;
      const captures = order.purchase_units[0].payments?.captures || [];
      if (captures.length > 1) throw ErrorWithCode.Factory.Forbidden("Unexpected captures");
      if (captures[0]) {
        const payment = captureSchema.parse(
          await paypalRequest(`/v2/payments/captures/${encodeURIComponent(captures[0].id)}`)
        );
        if (
          payment.id !== captures[0].id ||
          payment.supplementary_data.related_ids.order_id !== orderId ||
          (captureId && captureId !== payment.id)
        )
          throw ErrorWithCode.Factory.Forbidden("Capture mismatch");
        captureId = payment.id;
        status = payment.status;
        if (status === "COMPLETED" && order.status === "COMPLETED") until = passExpiry(payment.create_time);
      } else if (order.status === "COMPLETED") throw ErrorWithCode.Factory.Forbidden("Missing capture");
      const checked = new Date();
      await tx.$executeRaw`UPDATE "FixmitPass" SET "captureId" = ${captureId}, "status" = ${status}, "accessUntil" = ${until}, "checkedAt" = ${checked} WHERE "requestId" = ${row.requestId}`;
      return { ...row, captureId, status, accessUntil: until, checkedAt: checked };
    },
    { timeout: 45000 }
  );
}
export async function activePass(userId: number) {
  const rows = await prisma.$queryRaw<
    PassRow[]
  >`SELECT * FROM "FixmitPass" WHERE "userId" = ${userId} AND "status" = 'COMPLETED' AND "accessUntil" > CURRENT_TIMESTAMP ORDER BY "accessUntil" DESC`;
  for (const row of rows) {
    const verified =
      row.orderId && (!row.checkedAt || Date.now() - row.checkedAt.getTime() > 300000)
        ? await syncPass(row.orderId, userId)
        : row;
    if (verified.status === "COMPLETED" && verified.accessUntil && verified.accessUntil > new Date())
      return verified;
  }
  return undefined;
}
export async function latestPass(userId: number) {
  const rows = await prisma.$queryRaw<
    PassRow[]
  >`SELECT * FROM "FixmitPass" WHERE "userId" = ${userId} ORDER BY "createdAt" DESC LIMIT 1`;
  return rows[0];
}
export async function passWebhook(eventType: string, resource: unknown) {
  if (!eventType.startsWith("PAYMENT.CAPTURE.") && !eventType.startsWith("CHECKOUT.ORDER.")) return;
  const data = z
    .object({
      id: z.string(),
      links: z.array(z.object({ href: z.string(), rel: z.string() })).optional(),
      supplementary_data: z
        .object({
          related_ids: z.object({ order_id: z.string().optional(), capture_id: z.string().optional() }),
        })
        .optional(),
    })
    .parse(resource);
  const related = data.supplementary_data?.related_ids;
  const orderId = eventType.startsWith("CHECKOUT.ORDER.") ? data.id : related?.order_id;
  const captureLink = data.links?.find((link) => link.rel === "up")?.href;
  const linkedCapture = captureLink?.match(
    /^https:\/\/api(?:-m)?\.(?:sandbox\.)?paypal\.com\/v2\/payments\/captures\/([A-Z0-9]+)$/
  )?.[1];
  const captureId = related?.capture_id || linkedCapture || data.id;
  const rows = await prisma.$queryRaw<
    PassRow[]
  >`SELECT * FROM "FixmitPass" WHERE "orderId" = ${orderId || ""} OR "captureId" = ${captureId}`;
  for (const row of rows) {
    if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(eventType)) {
      const status = eventType.endsWith("REFUNDED") ? "REFUNDED" : "REVERSED";
      await prisma.$executeRaw`UPDATE "FixmitPass" SET "status" = ${status}, "accessUntil" = NULL, "checkedAt" = CURRENT_TIMESTAMP WHERE "requestId" = ${row.requestId}`;
    } else if (row.orderId) await syncPass(row.orderId, row.userId, eventType === "CHECKOUT.ORDER.APPROVED");
  }
}
