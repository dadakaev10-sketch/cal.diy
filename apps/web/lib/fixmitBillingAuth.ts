import process from "node:process";
import { studioPasswordStamp } from "@calcom/features/auth/lib/studioAccountSecurity";
import prisma from "@calcom/prisma";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function billingUser(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({
    req,
    secret,
    secureCookie: process.env.NEXTAUTH_URL?.startsWith("https://"),
  });
  const id = Number(token?.sub || token?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, locked: true, locale: true, password: { select: { hash: true } } },
  });
  if (
    !user ||
    user.locked ||
    !user.password ||
    token?.studioPasswordStamp !== studioPasswordStamp(user.password.hash, secret)
  )
    return null;
  return { id: user.id, locale: user.locale || "de" };
}
