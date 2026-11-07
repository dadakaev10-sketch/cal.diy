import { createPrivateKey, randomBytes, sign } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { z } from "zod";
import { identityProof, openSocial } from "./studioSocialIdentity";
export const appleClientId = () => process.env.APPLE_SIGNIN_CLIENT_ID || "com.fixmit.studio";
export const appleReady = () =>
  !!(
    process.env.APPLE_SIGNIN_PRIVATE_KEY_BASE64 &&
    process.env.APPLE_SIGNIN_KEY_ID &&
    process.env.APPLE_SIGNIN_TEAM_ID
  );
function appleSecret() {
  if (!appleReady()) throw ErrorWithCode.Factory.InternalServerError("apple_auth_unavailable");
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_SIGNIN_KEY_ID })).toString(
    "base64url"
  );
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      iss: process.env.APPLE_SIGNIN_TEAM_ID,
      iat: now,
      exp: now + 600,
      aud: "https://appleid.apple.com",
      sub: appleClientId(),
    })
  ).toString("base64url");
  const key = createPrivateKey(Buffer.from(process.env.APPLE_SIGNIN_PRIVATE_KEY_BASE64 || "", "base64"));
  return `${header}.${body}.${sign("sha256", Buffer.from(`${header}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
export async function appleRequest(path: "token" | "revoke", params: Record<string, string>) {
  const response = await fetch(`https://appleid.apple.com/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appleClientId(), client_secret: appleSecret(), ...params }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const text = await response.text();
  let value: unknown = {};
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    throw ErrorWithCode.Factory.InternalServerError("apple_auth_unavailable");
  }
  const error = z.object({ error: z.string().optional() }).passthrough().parse(value).error;
  if (!response.ok || error) {
    if (error === "invalid_grant") throw ErrorWithCode.Factory.Unauthorized("apple_credentials_revoked");
    throw ErrorWithCode.Factory.InternalServerError("apple_auth_unavailable");
  }
  return value;
}
export async function queueAppleRevocation(refresh: string) {
  if (
    await prisma.verificationToken.findFirst({
      where: { identifier: `studio-apple-revoke:${refresh}` },
      select: { id: true },
    })
  )
    return;
  await prisma.verificationToken.create({
    data: {
      identifier: `studio-apple-revoke:${refresh}`,
      token: randomBytes(32).toString("hex"),
      expires: new Date(Date.now() + 7 * 86400000),
    },
    select: { id: true },
  });
}
export async function revokeUserAppleAccounts(userId: number) {
  const accounts = await prisma.account.findMany({
    where: { userId, provider: "studio-apple" },
    select: { refresh_token: true },
  });
  for (const account of accounts)
    if (account.refresh_token) await queueAppleRevocation(account.refresh_token);
  await retryAppleRevocations();
}
export async function retryAppleRevocations() {
  if (!appleReady()) return;
  const jobs = await prisma.verificationToken.findMany({
    where: { identifier: { startsWith: "studio-apple-revoke:" }, expires: { gt: new Date() } },
    select: { id: true, identifier: true },
    take: 5,
    orderBy: { createdAt: "asc" },
  });
  await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        await appleRequest("revoke", {
          token: openSocial(job.identifier.slice("studio-apple-revoke:".length)),
          token_type_hint: "refresh_token",
        });
        await prisma.verificationToken.deleteMany({ where: { id: job.id } });
      } catch {
        console.warn("APPLE_REVOCATION_RETRY_PENDING");
      }
    })
  );
  await prisma.verificationToken.deleteMany({
    where: { identifier: { startsWith: "studio-apple-revoke:" }, expires: { lt: new Date() } },
  });
}
export async function cleanupSocialProofs() {
  const expired = await prisma.verificationToken.findMany({
    where: { identifier: { startsWith: "studio-social:" }, expires: { lt: new Date() } },
    select: { id: true, identifier: true },
    take: 100,
  });
  for (const row of expired) {
    if (row.identifier.startsWith("studio-social:identity:")) {
      try {
        const data = identityProof.parse(
          JSON.parse(openSocial(row.identifier.slice("studio-social:identity:".length)))
        );
        if (data.identity.provider === "apple" && data.identity.refresh) {
          const linked = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: { provider: "studio-apple", providerAccountId: data.identity.sub },
            },
            select: { id: true },
          });
          if (!linked) await queueAppleRevocation(data.identity.refresh);
        }
      } catch {
        console.warn("SOCIAL_PROOF_CLEANUP_FAILED");
      }
    }
    await prisma.verificationToken.deleteMany({ where: { id: row.id } });
  }
  await retryAppleRevocations();
}
export async function validAppleAccount(account: {
  id: string;
  refresh_token: string | null;
  expires_at: number | null;
}) {
  if (!account.refresh_token) return false;
  if ((account.expires_at || 0) > Date.now() / 1000) return true;
  try {
    await appleRequest("token", {
      grant_type: "refresh_token",
      refresh_token: openSocial(account.refresh_token),
    });
    await prisma.account.update({
      where: { id: account.id },
      data: { expires_at: Math.floor(Date.now() / 1000) + 86400 },
      select: { id: true },
    });
    return true;
  } catch (error) {
    if (error instanceof ErrorWithCode && error.message === "apple_credentials_revoked") {
      await prisma.account.update({
        where: { id: account.id },
        data: { refresh_token: null },
        select: { id: true },
      });
      return false;
    }
    throw error;
  }
}
