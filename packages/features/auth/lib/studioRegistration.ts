import { randomBytes } from "node:crypto";
import process from "node:process";
import AccountVerifyEmail from "@calcom/emails/templates/account-verify-email";
import { getTranslation } from "@calcom/i18n/server";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { z } from "zod";
import { studioAccountRateLimit, studioTokenHash, validStudioPassword } from "./studioAccountSecurity";

export const studioRegistrationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().trim().min(2).max(80),
  studioName: z.string().trim().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/),
  timeZone: z
    .string()
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  password: z.string().max(72).refine(validStudioPassword),
});

const reserved = new Set([
  "api",
  "auth",
  "register",
  "signup",
  "login",
  "settings",
  "admin",
  "teams",
  "team",
  "event-types",
  "availability",
  "bookings",
  "booking",
  "apps",
  "workflows",
  "insights",
  "onboarding",
  "getting-started",
  "studio-admin",
  "confirm",
  "cancel",
  "reschedule",
  "payment",
  "payments",
  "success",
  "upgrade",
  "connect",
  "help",
  "support",
]);

export async function requestStudioRegistration(input: {
  email: string;
  locale: "de" | "en";
  studioName?: string;
  createdBy?: number;
}) {
  if (!(await studioAccountRateLimit("registration-email", input.email, 3))) return;
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) return;
  const token = randomBytes(32).toString("hex");
  const tokenHash = studioTokenHash(token);
  await prisma.studioRegistrationRequest.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.studioRegistrationRequest.create({
    data: { tokenHash, ...input, expiresAt: new Date(Date.now() + 3_600_000) },
    select: { tokenHash: true },
  });
  try {
    const base = process.env.NEXTAUTH_URL;
    if (!base) throw ErrorWithCode.Factory.InternalServerError("Authentication unavailable");
    await new AccountVerifyEmail({
      user: { email: input.email, name: input.studioName || null },
      language: await getTranslation(input.locale, "common"),
      verificationEmailLink: new URL(`/register/verify?token=${token}&lang=${input.locale}`, base).href,
    }).sendEmail({ throwOnError: true });
  } catch {
    await prisma.studioRegistrationRequest.deleteMany({ where: { tokenHash } });
    console.error("STUDIO_REGISTRATION_DELIVERY_FAILED");
  }
}

export async function completeStudioRegistration(rawInput: z.infer<typeof studioRegistrationSchema>) {
  const input = studioRegistrationSchema.parse(rawInput);
  if (reserved.has(input.slug)) return "studio_slug_unavailable";
  const hash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const request = await tx.studioRegistrationRequest.findFirst({
      where: { tokenHash: studioTokenHash(input.token), expiresAt: { gt: new Date() } },
      select: { tokenHash: true, email: true, locale: true, studioName: true, createdBy: true },
    });
    if (!request) return "request_is_expired";
    // PostgreSQL permits duplicate nullable-scope slugs. Serialize our global namespace claims.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"studio-registration:" + input.slug}))`;
    const takenUser = await tx.user.findFirst({
      where: {
        OR: [
          { email: { equals: request.email, mode: "insensitive" } },
          { username: { equals: input.slug, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    const takenTeam = await tx.team.findFirst({
      where: { slug: { equals: input.slug, mode: "insensitive" } },
      select: { id: true },
    });
    if (takenUser || takenTeam) return "studio_slug_unavailable";
    const consumed = await tx.studioRegistrationRequest.deleteMany({
      where: { tokenHash: request.tokenHash, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) return "request_is_expired";
    const user = await tx.user.create({
      data: {
        email: request.email,
        emailVerified: new Date(),
        username: input.slug,
        name: input.name,
        locale: request.locale,
        timeZone: input.timeZone,
        timeFormat: 24,
        weekStart: "Monday",
        identityProvider: "CAL",
        role: "USER",
        locked: false,
        creationSource: "WEBAPP",
        password: { create: { hash } },
      },
      select: { id: true },
    });
    const schedule = await tx.schedule.create({
      data: {
        userId: user.id,
        name: request.locale === "de" ? "Studio-Zeiten" : "Studio hours",
        timeZone: input.timeZone,
      },
      select: { id: true },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { defaultScheduleId: schedule.id },
      select: { id: true },
    });
    await tx.team.create({
      data: {
        name: request.studioName || input.studioName,
        slug: input.slug,
        timeZone: input.timeZone,
        isOrganization: false,
        metadata: { studioPlatform: true, provisionedBy: request.createdBy },
        members: { create: { userId: user.id, role: "OWNER", accepted: true } },
      },
      select: { id: true },
    });
    await tx.studioRegistrationRequest.deleteMany({ where: { email: request.email } });
    return "studio_registration_complete";
  });
}
