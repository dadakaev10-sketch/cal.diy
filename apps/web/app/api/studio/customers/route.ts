import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { studioAccountRateLimit } from "@calcom/features/auth/lib/studioAccountSecurity";
import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const customerInput = z
  .object({
    sourceEmail: email,
    email,
    name: z.string().trim().min(1).max(120),
    phone: z
      .string()
      .trim()
      .max(50)
      .regex(/^[+0-9() ./-]*$/),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();
const select = {
  sourceEmail: true,
  email: true,
  name: true,
  phone: true,
  aliases: true,
  updatedAt: true,
} as const;
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function owner() {
  return (await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) }))?.user?.id;
}
export async function GET() {
  const userId = await owner();
  if (!userId) return reply({ error: "Unauthorized" }, 401);
  return reply({ profiles: await prisma.studioCustomerProfile.findMany({ where: { userId }, select }) });
}
export async function POST(request: Request) {
  const userId = await owner();
  if (!userId) return reply({ error: "Unauthorized" }, 401);
  if (request.headers.get("origin") !== new URL(WEBAPP_URL).origin) return reply({ error: "Forbidden" }, 403);
  if (!(await studioAccountRateLimit("customer-profile-write", String(userId), 60)))
    return reply({ error: "Too many requests" }, 429);
  const text = await request.text();
  if (text.length > 4096) return reply({ error: "Invalid request" }, 400);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reply({ error: "Invalid request" }, 400);
  }
  const parsed = customerInput.safeParse(json);
  if (!parsed.success) return reply({ error: "Invalid contact" }, 400);
  const input = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(73128, $1)", userId);
      const known = await tx.attendee.findFirst({
        where: { email: { equals: input.sourceEmail, mode: "insensitive" }, booking: { userId } },
        select: { id: true },
      });
      if (!known) return { error: "Customer not found", status: 404 };
      const current = await tx.studioCustomerProfile.findUnique({
        where: { userId_sourceEmail: { userId, sourceEmail: input.sourceEmail } },
        select,
      });
      if ((current?.updatedAt.toISOString() ?? null) !== input.updatedAt)
        return { error: "Contact changed. Reload first.", status: 409 };
      const aliases = Array.from(
        new Set([input.sourceEmail, ...(current?.aliases ?? []), ...(current ? [current.email] : [])])
      );
      if (aliases.length > 20) return { error: "Contact history requires review", status: 409 };
      const collision = await tx.studioCustomerProfile.findFirst({
        where: {
          userId,
          sourceEmail: { not: input.sourceEmail },
          OR: [
            { email: { in: [input.email, input.sourceEmail] } },
            { sourceEmail: { in: [input.email, input.sourceEmail] } },
            { aliases: { hasSome: [input.email, input.sourceEmail] } },
          ],
        },
        select: { id: true },
      });
      const existingBooking =
        !aliases.includes(input.email) && input.email !== current?.email
          ? await tx.attendee.findFirst({
              where: { email: { equals: input.email, mode: "insensitive" }, booking: { userId } },
              select: { id: true },
            })
          : null;
      if (collision || existingBooking) return { error: "Email belongs to another customer", status: 409 };
      return {
        profile: await tx.studioCustomerProfile.upsert({
          where: { userId_sourceEmail: { userId, sourceEmail: input.sourceEmail } },
          create: {
            userId,
            sourceEmail: input.sourceEmail,
            email: input.email,
            name: input.name,
            phone: input.phone,
            aliases,
          },
          update: { email: input.email, name: input.name, phone: input.phone, aliases },
          select,
        }),
      };
    });
    if ("error" in result) return reply({ error: result.error }, result.status);
    return reply(result);
  } catch {
    return reply({ error: "Contact could not be saved" }, 503);
  }
}
