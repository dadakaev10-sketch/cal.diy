import process from "node:process";
import { studioAccountRateLimit, studioPasswordStamp } from "@calcom/features/auth/lib/studioAccountSecurity";
import {
  type SocialIdentity,
  socialError,
  socialProvider,
} from "@calcom/features/auth/lib/studioSocialIdentity";
import { validSocialSession } from "@calcom/features/auth/lib/studioSocialSession";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import { totpAuthenticatorCheck } from "@calcom/lib/totp";
import prisma from "@calcom/prisma";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { encode, getToken } from "next-auth/jwt";
import { z } from "zod";
export const userSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  role: true,
  locale: true,
  locked: true,
  metadata: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  backupCodes: true,
  password: { select: { hash: true } },
} as const;
export const getSocialUser = (id: number) => prisma.user.findUnique({ where: { id }, select: userSelect });
export type SocialUser = NonNullable<Awaited<ReturnType<typeof getSocialUser>>>;
export const passwordless = (user: SocialUser) =>
  z
    .object({ studioSocialPasswordless: z.literal(true) })
    .passthrough()
    .safeParse(user.metadata).success;
export async function actor(request: NextRequest, fresh = false) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, secureCookie: true });
  const id = Number(token?.sub);
  if (!token || !Number.isSafeInteger(id) || id <= 0) return socialError("signin_required");
  const user = await getSocialUser(id);
  const secret = process.env.NEXTAUTH_SECRET;
  if (
    !user ||
    user.locked ||
    !user.password?.hash ||
    !secret ||
    token.studioPasswordStamp !== studioPasswordStamp(user.password.hash, secret) ||
    !(await validSocialSession(id, token.studioSocial, user.twoFactorEnabled))
  )
    return socialError("signin_required");
  if (user.role === "ADMIN" && token.role !== "ADMIN") return socialError("password_login_required");
  if (
    fresh &&
    (typeof token.studioAuthenticatedAt !== "number" || Date.now() / 1000 - token.studioAuthenticatedAt > 300)
  )
    return socialError("reauth_required");
  return { user, token };
}
export async function secondFactor(user: SocialUser, totp?: string, backup?: string) {
  if (!user.twoFactorEnabled) return;
  if (!(await studioAccountRateLimit("social-second-factor", String(user.id), 5)))
    return socialError("invalid_second_factor");
  const key = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!key) return socialError("social_auth_unavailable");
  if (backup && user.backupCodes) {
    const codes: z.infer<typeof codesSchema> = codesSchema.parse(
      JSON.parse(symmetricDecrypt(user.backupCodes, key))
    );
    const index = codes.indexOf(backup.replaceAll("-", ""));
    if (index < 0) return socialError("invalid_second_factor");
    codes[index] = null;
    const result = await prisma.user.updateMany({
      where: { id: user.id, backupCodes: user.backupCodes },
      data: { backupCodes: symmetricEncrypt(JSON.stringify(codes), key) },
    });
    if (result.count !== 1) return socialError("invalid_second_factor");
    return;
  }
  if (!totp) return socialError("second_factor_required");
  if (!user.twoFactorSecret || !totpAuthenticatorCheck(totp, symmetricDecrypt(user.twoFactorSecret, key)))
    return socialError("invalid_second_factor");
}
const codesSchema = z.array(z.string().nullable());
export async function socialSession(user: SocialUser, identity: SocialIdentity, reauthenticated = false) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || !user.password?.hash || user.locked) return socialError("signin_required");
  if (user.role === "ADMIN" && !user.twoFactorEnabled) return socialError("password_login_required");
  const timeout = z
    .object({ sessionTimeout: z.number().positive().optional() })
    .passthrough()
    .safeParse(user.metadata);
  const maxAge = Math.min(
    30 * 86400,
    timeout.success && timeout.data.sessionTimeout ? timeout.data.sessionTimeout * 60 : 30 * 86400
  );
  const token = await encode({
    secret,
    maxAge,
    token: {
      sub: String(user.id),
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      orgAwareUsername: user.username,
      role: user.role,
      locale: user.locale || "de",
      belongsToActiveTeam: true,
      studioPasswordStamp: studioPasswordStamp(user.password.hash, secret),
      studioAuthenticatedAt: Math.floor(Date.now() / 1000),
      studioSocialReauthenticatedAt: reauthenticated ? Math.floor(Date.now() / 1000) : undefined,
      studioSocial: {
        provider: socialProvider.parse(identity.provider),
        sub: identity.sub,
        mfa: user.twoFactorEnabled,
      },
    },
  });
  const response = NextResponse.json({ status: "signed_in" }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("__Secure-next-auth.session-token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
