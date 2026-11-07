// @vitest-environment node
import { randomBytes } from "node:crypto";
import process from "node:process";
import { studioTokenHash } from "@calcom/features/auth/lib/studioAccountSecurity";
import { resetStudioPassword } from "@calcom/features/auth/lib/studioPasswordRecovery";
import { createSocialProof, proofHash, sealSocial } from "@calcom/features/auth/lib/studioSocialIdentity";
import { verifyPassword } from "@calcom/features/auth/lib/verifyPassword";
import { deleteUser } from "@calcom/features/users/lib/deleteUser";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import prisma from "@calcom/prisma";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { studioAccessGate } from "../studioAccessGate";
import { exchangeIdentity, methods, onboardSocial, unlink } from "./account";
import { actor, getSocialUser, socialSession } from "./session";

let safeDatabase = false;
const enabled = process.env.FIXMIT_SOCIAL_INTEGRATION === "1";
const suffix = randomBytes(6).toString("hex"),
  email = `social-e2e-${suffix}@example.invalid`,
  otherEmail = `social-e2e-other-${suffix}@example.invalid`,
  slug = `social-${suffix}`,
  verifier = "v".repeat(43),
  googleSub = `fixture-google-${suffix}`,
  appleSub = `fixture-apple-${suffix}`;
const refresh = enabled ? sealSocial(`fixture-refresh-${suffix}`) : "";
const request = (cookie: string) =>
  new NextRequest("https://fixmit.com/api/studio-auth/exchange", {
    headers: { cookie, origin: "https://fixmit.com" },
  });
async function proof(
  provider: "google" | "apple",
  mode: "login" | "link" = "login",
  actor?: number,
  mail = email
) {
  return createSocialProof(
    "identity",
    {
      provider,
      mode,
      actor,
      challenge: proofHash(verifier),
      nonce: "fixture",
      identity: {
        provider,
        sub: provider === "google" ? googleSub : appleSub,
        email: mail,
        refresh: provider === "apple" ? refresh : undefined,
      },
    },
    15
  );
}
const cookie = (response: Awaited<ReturnType<typeof socialSession>>) =>
  `__Secure-next-auth.session-token=${response.cookies.get("__Secure-next-auth.session-token")!.value}`;
describe.skipIf(!enabled)("native OAuth lifecycle against an isolated database", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("fixmit_deposit_test"))
      throw Error("Isolated test database required");
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database()::text AS name`;
    expect(rows[0].name).toBe("fixmit_deposit_test");
    safeDatabase = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("External requests are forbidden in this database contract")))
    );
  });
  afterAll(async () => {
    if (!enabled || !safeDatabase) {
      await prisma.$disconnect();
      return;
    }
    for (const mail of [email, otherEmail]) {
      const user = await prisma.user.findUnique({
        where: { email: mail },
        select: { id: true, email: true, metadata: true },
      });
      if (user) await deleteUser(user);
    }
    await prisma.verificationToken.deleteMany({ where: { identifier: "studio-apple-revoke:" + refresh } });
    await prisma.$disconnect();
  });
  it("creates one verified studio, protects linking, preserves email recovery and deletes provider accounts", async () => {
    const ticket = await proof("google");
    const created = await onboardSocial({
      ticket,
      verifier,
      name: "OAuth Fixture Owner",
      studioName: "OAuth Fixture Studio",
      slug,
      timeZone: "Europe/Vienna",
    });
    const firstCookie = cookie(created);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, emailVerified: true, metadata: true, defaultScheduleId: true },
    });
    expect(user.emailVerified).not.toBeNull();
    expect(user.defaultScheduleId).not.toBeNull();
    expect(user.metadata).toMatchObject({ studioSocialPasswordless: true });
    expect(
      await prisma.team.count({
        where: { slug, members: { some: { userId: user.id, role: "OWNER", accepted: true } } },
      })
    ).toBe(1);
    expect(
      await prisma.account.count({
        where: { userId: user.id, provider: "studio-google", providerAccountId: googleSub },
      })
    ).toBe(1);
    expect(
      await studioAccessGate(
        new NextRequest("https://fixmit.com/api/studio/customers", { headers: { cookie: firstCookie } })
      )
    ).toBeNull();
    expect(await (await methods(request(firstCookie))).json()).toMatchObject({
      passwordAvailable: false,
      providers: ["google"],
      sessionFresh: true,
    });
    await expect(
      onboardSocial({
        ticket,
        verifier,
        name: "Replay",
        studioName: "Replay",
        slug: slug + "-replay",
        timeZone: "UTC",
      })
    ).rejects.toThrow("social_proof_expired");
    const other = await prisma.user.create({
      data: {
        email: otherEmail,
        username: slug + "-other",
        name: "Other Fixture",
        emailVerified: new Date(),
        password: { create: { hash: await hashPassword("Other-Fixture-Password-12345") } },
      },
      select: { id: true },
    });
    const otherUser = (await getSocialUser(other.id))!;
    const otherCookie = cookie(
      await socialSession(otherUser, { provider: "google", sub: "unlinked-fixture" })
    );
    // Use a credential-style fixture session to exercise the authenticated linking boundary.
    const { encode } = await import("next-auth/jwt");
    const { studioPasswordStamp } = await import("@calcom/features/auth/lib/studioAccountSecurity");
    const auth = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      token: {
        sub: String(other.id),
        id: other.id,
        email: otherEmail,
        role: "USER",
        studioAuthenticatedAt: Math.floor(Date.now() / 1000),
        studioPasswordStamp: studioPasswordStamp(otherUser.password!.hash, process.env.NEXTAUTH_SECRET!),
      },
    });
    await expect(
      exchangeIdentity(request(`__Secure-next-auth.session-token=${auth}`), {
        ticket: await proof("google", "link", other.id),
        verifier,
      })
    ).rejects.toThrow("identity_already_linked");
    expect(
      (
        await prisma.account.findUniqueOrThrow({
          where: { provider_providerAccountId: { provider: "studio-google", providerAccountId: googleSub } },
          select: { userId: true },
        })
      ).userId
    ).toBe(user.id);
    expect(otherCookie).toContain("next-auth.session-token");
    const appleTicket = await proof("apple", "link", user.id);
    expect(
      await (await exchangeIdentity(request(firstCookie), { ticket: appleTicket, verifier })).json()
    ).toEqual({ status: "linked" });
    expect(await (await methods(request(firstCookie))).json()).toMatchObject({
      providers: expect.arrayContaining(["google", "apple"]),
    });
    expect(await (await unlink(request(firstCookie), "google")).json()).toMatchObject({
      status: "unlinked",
      needsLogin: true,
    });
    await expect(actor(request(firstCookie))).rejects.toThrow("signin_required");
    const appleUser = (await getSocialUser(user.id))!;
    const appleCookie = cookie(await socialSession(appleUser, { provider: "apple", sub: appleSub }));
    await expect(unlink(request(appleCookie), "apple")).rejects.toThrow("last_signin_method");
    const recovery = randomBytes(32).toString("hex"),
      newPassword = "New-Fixture-Password-123456";
    await prisma.resetPasswordRequest.create({
      data: { id: studioTokenHash(recovery), email, expires: new Date(Date.now() + 60000) },
    });
    expect(await resetStudioPassword(recovery, newPassword)).toBe(true);
    const recovered = (await getSocialUser(user.id))!;
    expect(await verifyPassword(newPassword, recovered.password!.hash)).toBe(true);
    expect(recovered.metadata).not.toMatchObject({ studioSocialPasswordless: true });
    await expect(actor(request(appleCookie))).rejects.toThrow("signin_required");
    const recoveredCookie = cookie(await socialSession(recovered, { provider: "apple", sub: appleSub }));
    expect(await (await methods(request(recoveredCookie))).json()).toMatchObject({ passwordAvailable: true });
    await deleteUser(recovered);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.team.count({ where: { slug } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.verificationToken.count({ where: { identifier: "studio-apple-revoke:" + refresh } })
    ).toBe(1);
    await expect(actor(request(recoveredCookie))).rejects.toThrow("signin_required");
  });
});
