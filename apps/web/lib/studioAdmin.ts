import process from "node:process";
import { studioPasswordStamp } from "@calcom/features/auth/lib/studioAccountSecurity";
import prisma from "@calcom/prisma";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function getStudioAdmin(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({
    req,
    secret,
    secureCookie: process.env.NEXTAUTH_URL?.startsWith("https://"),
  });
  const id = Number(token?.sub);
  if (!Number.isSafeInteger(id) || id <= 0 || token?.role !== "ADMIN") return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      locked: true,
      twoFactorEnabled: true,
      password: { select: { hash: true } },
    },
  });
  if (!user || user.locked || user.role !== "ADMIN" || !user.twoFactorEnabled || !user.password) return null;
  if (token.studioPasswordStamp !== studioPasswordStamp(user.password.hash, secret)) return null;
  return user.id;
}
