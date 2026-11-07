import { randomBytes } from "node:crypto";
import process from "node:process";
import { studioTokenHash } from "@calcom/features/auth/lib/studioAccountSecurity";
import { queueAppleRevocation, retryAppleRevocations } from "@calcom/features/auth/lib/studioApple";
import {
  completeStudioRegistration,
  studioRegistrationSchema,
} from "@calcom/features/auth/lib/studioRegistration";
import {
  assertSocialVerifier,
  consumeSocialProof,
  identityProof,
  readSocialProof,
  type SocialIdentity,
  socialAccountProvider,
  socialError,
} from "@calcom/features/auth/lib/studioSocialIdentity";
import prisma from "@calcom/prisma";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { actor, getSocialUser, passwordless, secondFactor, socialSession } from "./session";

const reply = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
async function discardIdentity(identity: SocialIdentity) {
  if (identity.provider === "apple" && identity.refresh) {
    await queueAppleRevocation(identity.refresh);
    await retryAppleRevocations();
  }
}
export async function exchangeIdentity(
  request: NextRequest,
  input: { ticket: string; verifier: string; totp?: string; backup?: string }
) {
  const { row, data } = await readSocialProof(input.ticket, "identity", identityProof);
  assertSocialVerifier(data.challenge, input.verifier);
  const identity = data.identity,
    provider = socialAccountProvider(identity.provider);
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: identity.sub } },
    select: { id: true, userId: true },
  });
  if (data.mode === "link") {
    const current = await actor(request, true);
    if (current.user.id !== data.actor) return socialError("wrong_account");
    if (linked && linked.userId !== current.user.id) return socialError("identity_already_linked");
    const owner = identity.email
      ? await prisma.user.findFirst({
          where: { email: { equals: identity.email, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    if (owner && owner.id !== current.user.id) return socialError("identity_already_linked");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"social-user-provider:" + current.user.id + ":" + provider}))`;
      const previous = await tx.account.findFirst({
        where: { userId: current.user.id, provider },
        select: { providerAccountId: true },
      });
      if (previous && previous.providerAccountId !== identity.sub)
        return socialError("provider_already_linked");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"social-account:" + provider + ":" + identity.sub}))`;
      const owner = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId: identity.sub } },
        select: { userId: true },
      });
      if (owner && owner.userId !== current.user.id) return socialError("identity_already_linked");
      const consumed = await tx.verificationToken.deleteMany({
        where: { token: row.token, identifier: row.identifier, expires: { gt: new Date() } },
      });
      if (consumed.count !== 1) return socialError("social_proof_expired");
      await tx.account.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId: identity.sub } },
        create: {
          type: "oauth",
          provider,
          providerAccountId: identity.sub,
          userId: current.user.id,
          providerEmail: identity.email,
          refresh_token: identity.refresh,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
        },
        update: {
          providerEmail: identity.email,
          refresh_token: identity.refresh,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
        },
        select: { id: true },
      });
    });
    return reply({ status: "linked" });
  }
  if (linked) {
    const user = await getSocialUser(linked.userId);
    if (!user || user.locked) return socialError("signin_required");
    if (data.mode === "reauth") {
      const current = await actor(request);
      if (data.actor !== current.user.id || user.id !== current.user.id) return socialError("wrong_account");
    }
    if (user.twoFactorEnabled && !input.totp && !input.backup)
      return reply({ status: "two_factor_required", ticket: input.ticket });
    await secondFactor(user, input.totp, input.backup);
    await consumeSocialProof(row);
    await prisma.account.update({
      where: { id: linked.id },
      data: {
        providerEmail: identity.email,
        refresh_token: identity.refresh,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
      },
      select: { id: true },
    });
    return socialSession(user, identity, data.mode === "reauth");
  }
  if (data.mode !== "login") return socialError("identity_not_linked");
  if (!identity.email) {
    await consumeSocialProof(row);
    await discardIdentity(identity);
    return socialError("verified_email_required");
  }
  const existing = await prisma.user.findFirst({
    where: { email: { equals: identity.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    await consumeSocialProof(row);
    await discardIdentity(identity);
    return reply({ status: "account_link_required" });
  }
  if (process.env.STUDIO_REGISTRATION_ENABLED !== "true") {
    await consumeSocialProof(row);
    await discardIdentity(identity);
    return socialError("registration_disabled");
  }
  return reply({
    status: "onboarding_required",
    ticket: input.ticket,
    email: identity.email,
    name: identity.name || "",
  });
}
export const socialOnboardInput = studioRegistrationSchema
  .omit({ token: true, password: true })
  .extend({ ticket: z.string().regex(/^[a-f0-9]{64}$/), verifier: z.string() })
  .strict();
export async function onboardSocial(input: z.infer<typeof socialOnboardInput>) {
  if (process.env.STUDIO_REGISTRATION_ENABLED !== "true") return socialError("registration_disabled");
  const { row, data } = await readSocialProof(input.ticket, "identity", identityProof);
  assertSocialVerifier(data.challenge, input.verifier);
  if (data.mode !== "login" || !data.identity.email) return socialError("invalid_social_proof");
  const token = randomBytes(32).toString("hex"),
    tokenHash = studioTokenHash(token);
  await prisma.studioRegistrationRequest.create({
    data: { tokenHash, email: data.identity.email, locale: "de", expiresAt: new Date(Date.now() + 300000) },
    select: { tokenHash: true },
  });
  let result: string;
  try {
    result = await completeStudioRegistration(
      { ...input, token, password: `Aa1!${randomBytes(32).toString("base64url")}` },
      { identity: data.identity, proof: row }
    );
  } finally {
    await prisma.studioRegistrationRequest.deleteMany({ where: { tokenHash } });
  }
  if (result !== "studio_registration_complete") return socialError(result);
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: socialAccountProvider(data.identity.provider),
        providerAccountId: data.identity.sub,
      },
    },
    select: { userId: true },
  });
  const user = account ? await getSocialUser(account.userId) : null;
  if (!user) return socialError("signin_required");
  return socialSession(user, data.identity);
}
export async function methods(request: NextRequest) {
  const current = await actor(request);
  const accounts = await prisma.account.findMany({
    where: { userId: current.user.id, provider: { in: ["studio-google", "studio-apple"] } },
    select: { provider: true },
  });
  return reply({
    userId: current.user.id,
    passwordAvailable: !passwordless(current.user),
    sessionFresh:
      typeof current.token.studioAuthenticatedAt === "number" &&
      Date.now() / 1000 - current.token.studioAuthenticatedAt < 300,
    providers: Array.from(new Set(accounts.map((a) => a.provider.slice(7)))),
    sessionProvider: z.object({ provider: z.string() }).safeParse(current.token.studioSocial).success
      ? z.object({ provider: z.string() }).parse(current.token.studioSocial).provider
      : "password",
  });
}
export async function unlink(request: NextRequest, providerName: "apple" | "google") {
  const current = await actor(request, true),
    provider = socialAccountProvider(providerName);
  const accounts = await prisma.account.findMany({
    where: { userId: current.user.id, provider: { in: ["studio-google", "studio-apple"] } },
    select: { id: true, provider: true, refresh_token: true },
  });
  const target = accounts.find((a) => a.provider === provider);
  if (!target) return reply({ status: "unlinked", needsLogin: false });
  if (accounts.length <= 1 && passwordless(current.user)) return socialError("last_signin_method");
  if (target.provider === "studio-apple" && target.refresh_token) {
    await queueAppleRevocation(target.refresh_token);
    await retryAppleRevocations();
  }
  await prisma.account.delete({ where: { id: target.id }, select: { id: true } });
  const claim = z.object({ provider: z.string() }).safeParse(current.token.studioSocial);
  return reply({ status: "unlinked", needsLogin: claim.success && claim.data.provider === providerName });
}
export async function cancelIdentity(ticket: string, verifier: string) {
  const { row, data } = await readSocialProof(ticket, "identity", identityProof);
  assertSocialVerifier(data.challenge, verifier);
  await consumeSocialProof(row);
  const linked = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: socialAccountProvider(data.identity.provider),
        providerAccountId: data.identity.sub,
      },
    },
    select: { id: true },
  });
  if (!linked) await discardIdentity(data.identity);
  return reply({ status: "cancelled" });
}
