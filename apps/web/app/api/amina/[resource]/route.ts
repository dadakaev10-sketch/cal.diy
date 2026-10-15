import { createHash } from "node:crypto";
import process from "node:process";
import { getPaymentAppData } from "@calcom/app-store/_utils/payments/getPaymentAppData";
import { studioAccountRateLimit } from "@calcom/features/auth/lib/studioAccountSecurity";
import { getEventTypesPublic } from "@calcom/features/eventtypes/lib/getEventTypesPublic";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { billingEnabled, entitled } from "@lib/fixmitBilling";
import { publicServiceCatalog } from "@lib/serviceCatalog";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  view: z.enum(["upcoming", "past", "cancelled", "all"]).default("upcoming"),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (process.env.FIXMIT_AMINA_READ_ENABLED !== "true" || !["services", "bookings"].includes(resource))
    return reply({ error: "Not available" }, 404);
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await studioAccountRateLimit("amina-read", ip, 180)))
      return reply({ error: "Too many requests" }, 429);
    const owner = await prisma.user.findFirst({
      where: { username: "azbeauty", locked: false },
      select: { id: true, metadata: true },
    });
    if (!owner || (billingEnabled() && !(await entitled(owner.id))))
      return reply({ error: "Not available" }, 404);

    if (resource === "services") {
      const events = await getEventTypesPublic(owner.id);
      const catalog = publicServiceCatalog(owner.metadata, events);
      return reply({
        catalog,
        services: events.map((event) => {
          const payment = getPaymentAppData(event);
          const display = event.metadata?.serviceDisplayPrice;
          let price: { amountMinor: number; currency: string } | null = null;
          if (payment.enabled)
            price = { amountMinor: payment.price, currency: payment.currency.toUpperCase() };
          else if (display?.enabled) price = { amountMinor: display.amountMinor, currency: display.currency };
          return {
            id: event.id,
            category_id: catalog.categories.some(
              (category) => category.id === event.metadata?.serviceCategoryId
            )
              ? event.metadata?.serviceCategoryId
              : null,
            title: event.title,
            description: event.description || "",
            minutes: event.length,
            url: `https://fixmit.com/azbeauty/${encodeURIComponent(event.slug)}`,
            price,
          };
        }),
      });
    }

    const prefix = process.env.API_KEY_PREFIX ?? "cal_";
    const header = request.headers.get("authorization") || "";
    const key = header.startsWith(`Bearer ${prefix}`) ? header.slice(7 + prefix.length) : "";
    if (!/^[a-f0-9]{32}$/.test(key)) return reply({ error: "Unauthorized" }, 401);
    const access = await prisma.apiKey.findUnique({
      where: { hashedKey: createHash("sha256").update(key).digest("hex") },
      select: { userId: true, teamId: true, expiresAt: true },
    });
    // Kein Team-Schlüssel und kein Schlüssel eines anderen Fixmit-Kontos.
    if (
      !access ||
      access.userId !== owner.id ||
      access.teamId !== null ||
      (access.expiresAt && access.expiresAt <= new Date())
    )
      return reply({ error: "Unauthorized" }, 401);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return reply({ error: "Invalid query" }, 400);
    const { view, offset } = parsed.data;
    const where: Prisma.BookingWhereInput = { userId: owner.id };
    if (view === "cancelled") where.status = { in: ["CANCELLED", "REJECTED"] };
    if (view === "upcoming" || view === "past") {
      where.status = { in: ["ACCEPTED", "PENDING", "AWAITING_HOST"] };
      // Nullable rescheduled darf bestehende Termine nicht verschwinden lassen.
      where.OR = [{ rescheduled: false }, { rescheduled: null }];
      where.endTime = view === "upcoming" ? { gte: new Date() } : { lt: new Date() };
    }
    const [bookings, count] = await prisma.$transaction(
      [
        prisma.booking.findMany({
          where,
          take: 50,
          skip: offset,
          orderBy: [{ startTime: view === "upcoming" ? "asc" : "desc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            status: true,
            rescheduled: true,
            attendees: { select: { name: true, email: true, phoneNumber: true } },
          },
        }),
        prisma.booking.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" }
    );
    return reply({ bookings, count, offset, limit: 50, checked_at: new Date().toISOString() });
  } catch {
    return reply({ error: "Fixmit unavailable" }, 503);
  }
}
