import { randomBytes } from "node:crypto";
import process from "node:process";
import ForgotPasswordEmail from "@calcom/emails/templates/forgot-password-email";
import { getTranslation } from "@calcom/i18n/server";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { IdentityProvider } from "@calcom/prisma/enums";
import { studioAccountRateLimit, studioTokenHash, validStudioPassword } from "./studioAccountSecurity";

export async function requestStudioPasswordRecovery(email: string) {
  // Identical limits and responses for existing and unknown addresses prevent account enumeration.
  if (!(await studioAccountRateLimit("recovery-email", email, 3))) return;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, locale: true, locked: true, identityProvider: true },
  });
  if (!user || user.locked || user.identityProvider !== IdentityProvider.CAL) return;
  const token = randomBytes(32).toString("hex");
  const id = studioTokenHash(token);
  await prisma.resetPasswordRequest.create({
    data: { id, email, expires: new Date(Date.now() + 3_600_000) },
    select: { id: true },
  });
  try {
    const base = process.env.NEXTAUTH_URL;
    if (!base) throw ErrorWithCode.Factory.InternalServerError("Authentication unavailable");
    await new ForgotPasswordEmail({
      user,
      language: await getTranslation(user.locale || "de", "common"),
      resetLink: new URL(`/recover/${token}`, base).href,
    }).sendEmail({ throwOnError: true });
  } catch {
    await prisma.resetPasswordRequest.deleteMany({ where: { id } });
    // A public delivery error would reveal which addresses have accounts.
    console.error("STUDIO_PASSWORD_RECOVERY_DELIVERY_FAILED");
  }
}

export async function resetStudioPassword(token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !validStudioPassword(password)) return false;
  const id = studioTokenHash(token);
  const hash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const request = await tx.resetPasswordRequest.findFirst({
      where: { id, expires: { gt: new Date() } },
      select: { email: true },
    });
    if (!request) return false;
    // Serialize all resets for this account, including concurrent requests using different links.
    const users = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT "id" FROM "users" WHERE "email" = ${request.email} AND "locked" = false
        AND "identityProvider" = 'CAL' FOR UPDATE`;
    if (!users[0]) return false;
    const consumed = await tx.resetPasswordRequest.deleteMany({ where: { id, expires: { gt: new Date() } } });
    if (consumed.count !== 1) return false;
    await tx.userPassword.upsert({
      where: { userId: users[0].id },
      create: { userId: users[0].id, hash },
      update: { hash },
      select: { userId: true },
    });
    await tx.resetPasswordRequest.deleteMany({ where: { email: request.email } });
    return true;
  });
}
