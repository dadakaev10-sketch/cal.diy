"use server";

import process from "node:process";
import { MerchantConnectionService } from "@calcom/app-store/stripepayment/lib/MerchantConnectionService";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";

async function requireUser() {
  if (process.env.MERCHANT_STRIPE_TEST_ENABLED !== "true") throw ErrorWithCode.Factory.Forbidden("Disabled");
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) throw ErrorWithCode.Factory.Unauthorized("Unauthorized");
  return session.user.id;
}

export async function saveStudioStripe(form: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = await requireUser();
    const teamId = z.coerce.number().int().positive().parse(form.get("teamId"));
    const service = new MerchantConnectionService(prisma, process.env.MERCHANT_STRIPE_ENCRYPTION_KEY ?? "");
    await service.save(userId, teamId, {
      accountId: form.get("accountId"),
      publishableKey: form.get("publishableKey"),
      restrictedKey: form.get("restrictedKey"),
      webhookSecret: form.get("webhookSecret") || undefined,
    });
  } catch (error) {
    const knownErrors = [
      "merchant_stripe_invalid_keys",
      "merchant_stripe_account_locked",
      "merchant_stripe_verification_failed",
    ];
    if (error instanceof ErrorWithCode && knownErrors.includes(error.message)) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "merchant_stripe_save_failed" };
  }
  revalidatePath("/settings/my-account/studio-payments");
  return { ok: true };
}

export async function createTestStudio(form: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = await requireUser();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== "ADMIN") throw ErrorWithCode.Factory.Forbidden("Unauthorized");
    const name = z.string().trim().min(2).max(80).parse(form.get("name"));
    await prisma.team.create({
      data: { name, members: { create: { userId, role: "OWNER", accepted: true } } },
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "merchant_stripe_save_failed" };
  }
  revalidatePath("/settings/my-account/studio-payments");
  return { ok: true };
}
