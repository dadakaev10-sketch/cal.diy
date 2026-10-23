import { createHash } from "node:crypto";
import process from "node:process";
import { studioAccountRateLimit } from "@calcom/features/auth/lib/studioAccountSecurity";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { fixmitAvailabilityInput } from "@lib/amina-availability-contract";
import { billingEnabled, entitled } from "@lib/fixmitBilling";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const select = {
  id: true,
  name: true,
  timeZone: true,
  userId: true,
  availability: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      days: true,
      date: true,
      startTime: true,
      endTime: true,
      userId: true,
      eventTypeId: true,
    },
  },
  eventType: {
    orderBy: { id: "asc" as const },
    select: { id: true, title: true },
  },
} satisfies Prisma.ScheduleSelect;
type Schedule = Prisma.ScheduleGetPayload<{ select: typeof select }>;
type Owner = { id: number; timeZone: string; defaultScheduleId: number | null };
const revision = (schedule: Schedule, owner: Owner) =>
  createHash("sha256").update(JSON.stringify({ schedule, owner })).digest("hex");
const hhmm = (date: Date) => {
  // Keine unbemerkte Rundung vorhandener sekundengenauer Daten.
  if (date.getUTCSeconds() || date.getUTCMilliseconds()) throw new Error("Unsupported precision");
  return date.toISOString().slice(11, 16);
};
async function read(db: Pick<Prisma.TransactionClient, "schedule">, owner: Owner) {
  const schedules = await db.schedule.findMany({
    where: { userId: owner.id },
    select,
    orderBy: { id: "asc" },
  });
  return {
    schedules: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      timeZone: s.timeZone || owner.timeZone,
      isDefault: owner.defaultScheduleId === s.id,
      revision: revision(s, owner),
      services: s.eventType,
      periods: s.availability.map((a) => ({
        days: a.days,
        date: a.date?.toISOString().slice(0, 10) ?? null,
        start: hhmm(a.startTime),
        end: hhmm(a.endTime),
      })),
    })),
    checked_at: new Date().toISOString(),
  };
}
async function authenticate(request: Request, write: boolean) {
  if (
    process.env.FIXMIT_AMINA_READ_ENABLED !== "true" ||
    (write && process.env.FIXMIT_AMINA_WRITE_ENABLED !== "true")
  )
    return null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await studioAccountRateLimit("amina-availability", ip, write ? 30 : 180))) return null;
  const owner = await prisma.user.findFirst({
    where: { username: "azbeauty", locked: false },
    select: { id: true, timeZone: true, defaultScheduleId: true },
  });
  if (!owner || (billingEnabled() && !(await entitled(owner.id)))) return null;
  const prefix = process.env.API_KEY_PREFIX ?? "cal_";
  const header = request.headers.get("authorization") || "";
  const key = header.startsWith(`Bearer ${prefix}`) ? header.slice(7 + prefix.length) : "";
  if (!/^[a-f0-9]{32}$/.test(key)) return null;
  const access = await prisma.apiKey.findUnique({
    where: { hashedKey: createHash("sha256").update(key).digest("hex") },
    select: { userId: true, teamId: true, expiresAt: true },
  });
  if (
    !access ||
    access.userId !== owner.id ||
    access.teamId !== null ||
    (access.expiresAt && access.expiresAt <= new Date())
  )
    return null;
  return owner;
}
export async function GET(request: Request) {
  try {
    const owner = await authenticate(request, false);
    if (!owner) return reply({ error: "Access unavailable" }, 403);
    return reply(await read(prisma, owner));
  } catch {
    return reply({ error: "Fixmit unavailable" }, 503);
  }
}
class Conflict extends Error {}
export async function PATCH(request: Request) {
  try {
    const owner = await authenticate(request, true);
    if (!owner) return reply({ error: "Access unavailable" }, 403);
    const parsed = fixmitAvailabilityInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Invalid schedule" }, 400);
    const { scheduleId, revision: expected, periods } = parsed.data;
    const result = await prisma.$transaction(
      async (tx) => {
        // Eigentümer und Zeitplan sperren; zugleich erneute Berechtigungsprüfung.
        // Keine Termin-, Zahlungs-, Benutzer- oder Mailmutation.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.id} FOR UPDATE`;
        const currentOwner = await tx.user.findFirst({
          where: { id: owner.id, username: "azbeauty", locked: false },
          select: { id: true, timeZone: true, defaultScheduleId: true },
        });
        const currentAccess = await tx.apiKey.findUnique({
          where: {
            hashedKey: createHash("sha256")
              .update(
                (request.headers.get("authorization") || "").slice(
                  7 + (process.env.API_KEY_PREFIX ?? "cal_").length
                )
              )
              .digest("hex"),
          },
          select: { userId: true, teamId: true, expiresAt: true },
        });
        if (
          !currentOwner ||
          !currentAccess ||
          currentAccess.userId !== owner.id ||
          currentAccess.teamId !== null ||
          (currentAccess.expiresAt && currentAccess.expiresAt <= new Date())
        )
          throw new Conflict();
        await tx.$queryRaw`SELECT id FROM "Schedule" WHERE id = ${scheduleId} AND "userId" = ${owner.id} FOR UPDATE`;
        const current = await tx.schedule.findFirst({
          where: { id: scheduleId, userId: owner.id },
          select,
        });
        if (!current || revision(current, currentOwner) !== expected) throw new Conflict();
        // Nur Zeitfenster dieses eigenen Plans ersetzen; Default-Zuordnung,
        // Zeitzone, fremde Pläne und bereits gebuchte Termine bleiben bestehen.
        await tx.schedule.update({
          where: { id: scheduleId },
          data: {
            availability: {
              deleteMany: { scheduleId },
              createMany: {
                data: periods.map((p) => ({
                  days: p.days,
                  date: p.date ? new Date(`${p.date}T00:00:00Z`) : null,
                  startTime: new Date(`1970-01-01T${p.start}:00Z`),
                  endTime: new Date(`1970-01-01T${p.end}:00Z`),
                })),
              },
            },
          },
        });
        return read(tx, currentOwner);
      },
      { isolationLevel: "Serializable" }
    );
    return reply(result);
  } catch (error) {
    if (
      error instanceof Conflict ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "P2034")
    )
      return reply({ error: "Schedule changed; reload" }, 409);
    return reply({ error: "Save not confirmed; reload before retry" }, 503);
  }
}
