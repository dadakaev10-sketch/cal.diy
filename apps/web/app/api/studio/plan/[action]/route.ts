import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { guardStudioAccountRequest, readStudioAccountBody } from "@lib/studioAccountRequest";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function owner() {
  return (await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) }))?.user?.id;
}

async function status(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locked: true, hideBranding: true, studioProGrant: { select: { userId: true } } },
  });
  if (!user || user.locked) return null;
  return {
    kind: user.studioProGrant ? "legacy" : "disabled",
    pro: true,
    endsAt: null,
    renewing: false,
    appAccountToken: "",
    freeServiceIds: [],
    selectionSet: false,
    freeIds: [],
    limit: 5,
    productId: "com.fixmit.studio.pro.monthly",
    purchasesReady: false,
    hideBranding: user.hideBranding,
    services: [],
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== "status") return reply({ error: "not_found" }, 404);
  try {
    const id = await owner();
    if (!id) return reply({ error: "signin_required" }, 401);
    const plan = await status(id);
    return plan ? reply(plan) : reply({ error: "signin_required" }, 401);
  } catch {
    return reply({ error: "studio_plan_unavailable" }, 503);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== "branding") return reply({ error: "not_found" }, 404);
  const denied = await guardStudioAccountRequest(req, "studio-plan-branding");
  if (denied) return denied;
  try {
    const id = await owner();
    if (!id) return reply({ error: "signin_required" }, 401);
    const plan = await status(id);
    if (!plan) return reply({ error: "signin_required" }, 401);
    if (plan.kind !== "legacy") return reply({ error: "studio_pro_required" }, 403);
    const { hidden } = z
      .object({ hidden: z.boolean() })
      .strict()
      .parse(await readStudioAccountBody(req));
    const user = await prisma.user.update({
      where: { id },
      data: { hideBranding: hidden },
      select: { hideBranding: true },
    });
    return reply({ ...plan, hideBranding: user.hideBranding });
  } catch (error) {
    if (error instanceof z.ZodError) return reply({ error: "bad_request_error" }, 400);
    return reply({ error: "studio_plan_unavailable" }, 503);
  }
}
