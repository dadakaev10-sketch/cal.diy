import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { z } from "zod";
import { studioTokenHash } from "./studioAccountSecurity";
export const socialProvider = z.enum(["apple", "google"]);
export type SocialProvider = z.infer<typeof socialProvider>;
export const socialIdentity = z.object({
  provider: socialProvider,
  sub: z.string().min(1).max(255),
  email: z.string().email().optional(),
  name: z.string().max(160).optional(),
  refresh: z.string().optional(),
});
export type SocialIdentity = z.infer<typeof socialIdentity>;
export const oauthState = z.object({
  provider: socialProvider,
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  nonce: z.string(),
  mode: z.enum(["login", "link", "reauth"]),
  actor: z.number().int().positive().optional(),
});
export const identityProof = oauthState.extend({ identity: socialIdentity });
export function socialError(message: string): never {
  throw ErrorWithCode.Factory.Unauthorized(message);
}
function encryptionKey() {
  const value = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!value) throw ErrorWithCode.Factory.InternalServerError("social_auth_unavailable");
  return createHash("sha256").update(value).digest();
}
export function sealSocial(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}
export function openSocial(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return socialError("invalid_social_proof");
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
export const proofHash = (value: string) => createHash("sha256").update(value).digest("base64url");
export async function createSocialProof(kind: string, value: unknown, minutes = 5) {
  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      token: studioTokenHash(token),
      identifier: `studio-social:${kind}:${sealSocial(JSON.stringify(value))}`,
      expires: new Date(Date.now() + minutes * 60000),
    },
    select: { id: true },
  });
  return token;
}
export async function readSocialProof<T>(token: string, kind: string, schema: z.ZodType<T>) {
  if (!/^[a-f0-9]{64}$/.test(token)) return socialError("invalid_social_proof");
  const row = await prisma.verificationToken.findUnique({
    where: { token: studioTokenHash(token) },
    select: { token: true, identifier: true, expires: true },
  });
  const prefix = `studio-social:${kind}:`;
  if (!row || row.expires.getTime() <= Date.now() || !row.identifier.startsWith(prefix))
    return socialError("social_proof_expired");
  return { row, data: schema.parse(JSON.parse(openSocial(row.identifier.slice(prefix.length)))) };
}
export async function consumeSocialProof(row: { token: string; identifier: string }) {
  const result = await prisma.verificationToken.deleteMany({
    where: { ...row, expires: { gt: new Date() } },
  });
  if (result.count !== 1) return socialError("social_proof_expired");
}
export function assertSocialVerifier(challenge: string, verifier: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier) || proofHash(verifier) !== challenge)
    return socialError("invalid_social_proof");
}
export const socialAccountProvider = (provider: SocialProvider) => `studio-${provider}`;
