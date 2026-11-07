import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { studioAccountRateLimit } from "@calcom/features/auth/lib/studioAccountSecurity";
import { deviceInput, parseDevice } from "@calcom/features/notifications/studioPush";
import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function handle(request: Request, remove: boolean) {
  const userId = (await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) }))?.user
    ?.id;
  if (!userId) return reply({ error: "Unauthorized" }, 401);
  if (request.headers.get("origin") !== new URL(WEBAPP_URL).origin) return reply({ error: "Forbidden" }, 403);
  if (!(await studioAccountRateLimit("native-push", String(userId), 30)))
    return reply({ error: "Rate limited" }, 429);
  const text = await request.text();
  if (text.length > 2048) return reply({ error: "Invalid request" }, 400);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return reply({ error: "Invalid request" }, 400);
  }
  const parsed = deviceInput.safeParse(input);
  if (!parsed.success) return reply({ error: "Invalid device" }, 400);
  const target = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${target.token}))`;
    const rows = await tx.notificationsSubscriptions.findMany({
      where: { subscription: { contains: target.token } },
      select: { id: true, userId: true, subscription: true },
    });
    const matches = rows.filter((row) => {
      const d = parseDevice(row.subscription);
      return d?.token === target.token && d.environment === target.environment;
    });
    if (remove) {
      await tx.notificationsSubscriptions.deleteMany({
        where: { id: { in: matches.filter((r) => r.userId === userId).map((r) => r.id) } },
      });
      return;
    }
    const own = matches.find((r) => r.userId === userId);
    await tx.notificationsSubscriptions.deleteMany({
      where: { id: { in: matches.filter((r) => r.id !== own?.id).map((r) => r.id) } },
    });
    const previous = own ? parseDevice(own.subscription) : null;
    if (own && previous && target.locale && target.locale !== previous.locale) {
      await tx.notificationsSubscriptions.updateMany({
        where: { id: own.id, userId, subscription: own.subscription },
        data: { subscription: JSON.stringify({ ...previous, locale: target.locale }) },
      });
    }
    if (!own)
      await tx.notificationsSubscriptions.create({
        data: { userId, subscription: JSON.stringify({ ...target, kind: "fixmit-apns-v1", sent: [] }) },
      });
  });
  return reply({ ok: true });
}
export async function POST(request: Request) {
  return handle(request, false);
}
export async function DELETE(request: Request) {
  return handle(request, true);
}
