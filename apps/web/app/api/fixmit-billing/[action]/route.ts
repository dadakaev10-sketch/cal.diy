import process from "node:process";
import prisma from "@calcom/prisma";
import {
  billingEnabled,
  createBilling,
  entitled,
  hasBillingAccess,
  paypalRequest,
  requiresBilling,
  syncBilling,
} from "@lib/fixmitBilling";
import { billingUser } from "@lib/fixmitBillingAuth";
import { createPass, latestPass, passWebhook, syncPass } from "@lib/fixmitPass";
import { guardStudioAccountRequest, readStudioAccountBody } from "@lib/studioAccountRequest";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const respond = (data: object, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!billingEnabled() && action !== "webhook") return respond({ error: "unavailable" }, 503);
  try {
    if (action === "webhook") {
      const webhookId = process.env.PAYPAL_WEBHOOK_ID;
      if (!webhookId) return respond({ error: "unavailable" }, 503);
      const body = await readStudioAccountBody(req);
      const event = z
        .object({
          event_type: z.string(),
          resource: z
            .object({ id: z.string().optional(), billing_agreement_id: z.string().optional() })
            .passthrough(),
        })
        .safeParse(body);
      if (!event.success) return respond({ error: "invalid" }, 400);
      const verified = z.object({ verification_status: z.string() }).parse(
        await paypalRequest("/v1/notifications/verify-webhook-signature", {
          method: "POST",
          body: JSON.stringify({
            webhook_id: webhookId,
            webhook_event: body,
            auth_algo: req.headers.get("paypal-auth-algo"),
            cert_url: req.headers.get("paypal-cert-url"),
            transmission_id: req.headers.get("paypal-transmission-id"),
            transmission_sig: req.headers.get("paypal-transmission-sig"),
            transmission_time: req.headers.get("paypal-transmission-time"),
          }),
        })
      );
      if (verified.verification_status !== "SUCCESS") return respond({ error: "invalid_signature" }, 403);
      await passWebhook(event.data.event_type, event.data.resource);
      const subscriptionId = event.data.event_type.startsWith("BILLING.SUBSCRIPTION.")
        ? event.data.resource.id
        : event.data.resource.billing_agreement_id;
      if (subscriptionId) {
        const rows = await prisma.$queryRaw<
          Array<{ userId: number }>
        >`SELECT "userId" FROM "FixmitSubscription" WHERE "subscriptionId" = ${subscriptionId}`;
        if (rows[0]) await syncBilling(rows[0].userId);
      }
      return respond({ received: true });
    }
    if (!["create", "confirm", "pass-create", "pass-confirm"].includes(action))
      return respond({ error: "not_found" }, 404);
    const denied = await guardStudioAccountRequest(req, "billing");
    if (denied) return denied;
    const user = await billingUser(req);
    if (!user) return respond({ error: "unauthorized" }, 401);
    if (action === "pass-confirm") {
      const body = z
        .object({
          orderId: z
            .string()
            .regex(/^[A-Z0-9]+$/)
            .optional(),
        })
        .parse(await readStudioAccountBody(req));
      const orderId = body.orderId || (await latestPass(user.id))?.orderId;
      if (!orderId) return respond({ active: false, status: "NEW" });
      const pass = await syncPass(orderId, user.id, true);
      return respond({
        active: pass.status === "COMPLETED" && !!pass.accessUntil && pass.accessUntil > new Date(),
        status: pass.status,
      });
    }
    if (action === "pass-create") {
      if (await entitled(user.id)) return respond({ error: "access_already_active" }, 409);
      return respond({ id: await createPass(user.id) });
    }
    if (action === "create") {
      if (await entitled(user.id)) return respond({ error: "access_already_active" }, 409);
      if (!(await requiresBilling(user.id))) return respond({ error: "subscription_not_required" }, 409);
      return respond({ id: await createBilling(user.id) });
    }
    const row = await syncBilling(user.id);
    return respond({ active: hasBillingAccess(row), status: row?.status || "NEW" });
  } catch {
    console.error("FIXMIT_BILLING_REQUEST_FAILED", action);
    return respond({ error: "billing_unavailable" }, 503);
  }
}
