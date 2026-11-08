import { studioStripeStatus } from "@calcom/app-store/stripepayment/lib/studioConnection";
import { paymentSettingsRevision } from "@calcom/app-store/stripepayment/lib/studioPaymentSettings";
import {
  connectRestrictedStripe,
  disconnectRestrictedStripe,
  restrictedInput,
} from "@calcom/app-store/stripepayment/lib/studioRestrictedStripe";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { guardStudioAccountRequest, readStudioAccountBody } from "@lib/studioAccountRequest";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
async function owner() {
  return (await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) }))?.user?.id;
}
function failed(error: unknown) {
  if (error instanceof z.ZodError) return reply({ error: "stripe_settings_invalid" }, 400);
  const known = new Set([
    "stripe_platform_unavailable",
    "stripe_already_connected",
    "stripe_account_unavailable",
    "stripe_connection_failed",
    "stripe_connection_expired",
    "stripe_pending_payments",
    "stripe_settings_changed",
    "stripe_key_mode_mismatch",
    "stripe_verification_required",
    "stripe_existing_direct_connection",
    "stripe_account_change_not_allowed",
    "stripe_vault_unavailable",
  ]);
  if (error instanceof ErrorWithCode && known.has(error.message)) return reply({ error: error.message }, 409);
  return reply({ error: "stripe_connection_failed" }, 503);
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const userId = await owner();
  if (!userId) return reply({ error: "signin_required" }, 401);
  try {
    if (action === "status") return reply(await studioStripeStatus(userId));
    if (action === "service") {
      const id = z.coerce.number().int().positive().parse(req.nextUrl.searchParams.get("id"));
      const event = await prisma.eventType.findFirst({
        where: { id, userId },
        select: { metadata: true, price: true, currency: true },
      });
      if (!event) return reply({ error: "service_not_found" }, 404);
      return reply({ revision: paymentSettingsRevision(event) });
    }
    return reply({ error: "not_found" }, 404);
  } catch (error) {
    return failed(error);
  }
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["connect", "disconnect", "check"].includes(action)) return reply({ error: "not_found" }, 404);
  const denied = await guardStudioAccountRequest(req, `native-stripe-${action}`);
  if (denied) return denied;
  const userId = await owner();
  if (!userId) return reply({ error: "signin_required" }, 401);
  try {
    const body = await readStudioAccountBody(req);
    if (action === "connect")
      return reply(await connectRestrictedStripe(userId, restrictedInput.parse(body)));
    if (action === "check") {
      z.object({}).strict().parse(body);
      return reply(await studioStripeStatus(userId));
    }
    if (action === "disconnect") {
      z.object({ confirm: z.literal(true) })
        .strict()
        .parse(body);
      return reply(await disconnectRestrictedStripe(userId));
    }
    return reply({ error: "not_found" }, 404);
  } catch (error) {
    return failed(error);
  }
}
