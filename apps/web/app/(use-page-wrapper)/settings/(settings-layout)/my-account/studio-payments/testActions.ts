"use server";

import process from "node:process";
import { MerchantTestCheckoutService } from "@calcom/app-store/stripepayment/lib/MerchantTestCheckoutService";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { z } from "zod";

async function context() {
  if (process.env.MERCHANT_STRIPE_TEST_ENABLED !== "true") throw ErrorWithCode.Factory.Forbidden("Disabled");
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) throw ErrorWithCode.Factory.Unauthorized("Unauthorized");
  return {
    userId: session.user.id,
    service: new MerchantTestCheckoutService(
      prisma,
      process.env.MERCHANT_STRIPE_ENCRYPTION_KEY ?? "",
      process.env.NEXT_PUBLIC_WEBAPP_URL ?? ""
    ),
  };
}

export async function startStudioStripeTest(form: FormData): Promise<{ url?: string; error?: string }> {
  try {
    const { userId, service } = await context();
    const teamId = z.coerce.number().int().positive().parse(form.get("teamId"));
    return await service.start(userId, teamId, {
      id: form.get("checkoutId"),
      totalMinor: Number(form.get("totalMinor")),
      prepaymentPercent: Number(form.get("prepaymentPercent")),
    });
  } catch (error) {
    if (
      error instanceof ErrorWithCode &&
      ["merchant_stripe_test_limit", "merchant_stripe_test_expired"].includes(error.message)
    )
      return { error: error.message };
    return { error: "merchant_stripe_test_failed" };
  }
}

export async function refreshStudioStripeTest(
  teamId: number,
  checkoutId: string
): Promise<{ status?: string; error?: string }> {
  try {
    const { userId, service } = await context();
    return await service.refresh(userId, z.number().int().positive().parse(teamId), checkoutId);
  } catch {
    return { error: "merchant_stripe_test_failed" };
  }
}
