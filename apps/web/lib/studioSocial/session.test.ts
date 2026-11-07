// @vitest-environment node

import { symmetricEncrypt } from "@calcom/lib/crypto";
import { Authenticator } from "@otplib/core";
import { createDigest, createRandomBytes } from "@otplib/plugin-crypto";
import { keyDecoder, keyEncoder } from "@otplib/plugin-thirty-two";
import { NextRequest } from "next/server";
import { decode, encode } from "next-auth/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), valid: vi.fn(), limit: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { user: { findUnique: m.user, updateMany: m.update } } }));
vi.mock("@calcom/features/auth/lib/studioSocialSession", () => ({ validSocialSession: m.valid }));
vi.mock("@calcom/features/auth/lib/studioAccountSecurity", async (original) => ({
  ...(await original<typeof import("@calcom/features/auth/lib/studioAccountSecurity")>()),
  studioAccountRateLimit: m.limit,
}));

import { studioPasswordStamp } from "@calcom/features/auth/lib/studioAccountSecurity";
import { actor, type SocialUser, secondFactor, socialSession } from "./session";

const secret = "test-session-encryption-secret",
  encryption = "12345678901234567890123456789012";
let user: SocialUser;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXTAUTH_SECRET", secret);
  vi.stubEnv("NEXTAUTH_URL", "https://fixmit.com");
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", encryption);
  user = {
    id: 9,
    email: "owner@example.invalid",
    name: "Studio Test",
    username: "studio-test",
    role: "USER",
    locale: "de",
    locked: false,
    metadata: {},
    twoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: null,
    password: { hash: "password-hash" },
  };
  m.user.mockImplementation(async () => user);
  m.valid.mockResolvedValue(true);
  m.limit.mockResolvedValue(true);
  m.update.mockResolvedValue({ count: 1 });
});
async function request(age = 0) {
  const token = await encode({
    secret,
    token: {
      sub: "9",
      id: 9,
      email: user.email,
      role: "USER",
      studioAuthenticatedAt: Math.floor(Date.now() / 1000) - age,
      studioPasswordStamp: studioPasswordStamp("password-hash", secret),
    },
  });
  return new NextRequest("https://fixmit.com/api/studio-auth/methods", {
    headers: { cookie: `__Secure-next-auth.session-token=${token}` },
  });
}
describe("native social sessions and MFA", () => {
  it("issues an encrypted, secure, HttpOnly session bound to the provider and password stamp", async () => {
    const response = await socialSession(user, { provider: "google", sub: "subject" });
    const cookie = response.cookies.get("__Secure-next-auth.session-token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    const token = await decode({ secret, token: cookie?.value });
    expect(token?.sub).toBe("9");
    expect(token?.studioPasswordStamp).toBe(studioPasswordStamp(user.password!.hash, secret));
    expect(token?.studioSocial).toEqual({ provider: "google", sub: "subject", mfa: false });
  });
  it("requires recent credential authentication for account linking", async () => {
    await expect(actor(await request(600), true)).rejects.toThrow("reauth_required");
    expect((await actor(await request(0), true)).user.id).toBe(9);
  });
  it("rejects a stale password stamp", async () => {
    const req = await request();
    user.password = { hash: "changed-hash" };
    await expect(actor(req)).rejects.toThrow("signin_required");
  });
  it("rejects a revoked provider session", async () => {
    m.valid.mockResolvedValue(false);
    await expect(actor(await request())).rejects.toThrow("signin_required");
  });
  it("never omits a configured second factor", async () => {
    user.twoFactorEnabled = true;
    await expect(secondFactor(user)).rejects.toThrow("second_factor_required");
  });
  it("verifies the real authenticator code against the encrypted account secret", async () => {
    user.twoFactorEnabled = true;
    const key = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    user.twoFactorSecret = symmetricEncrypt(key, encryption);
    const authenticator = new Authenticator({ createDigest, createRandomBytes, keyDecoder, keyEncoder });
    await expect(secondFactor(user, authenticator.generate(key))).resolves.toBeUndefined();
    await expect(secondFactor(user, "not-a-code")).rejects.toThrow("invalid_second_factor");
  });
  it("consumes backup codes with an optimistic concurrency guard", async () => {
    user.twoFactorEnabled = true;
    user.backupCodes = symmetricEncrypt(JSON.stringify(["aabbcc"]), encryption);
    await secondFactor(user, undefined, "aa-bb-cc");
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9, backupCodes: user.backupCodes } })
    );
    m.update.mockResolvedValue({ count: 0 });
    await expect(secondFactor(user, undefined, "aabbcc")).rejects.toThrow("invalid_second_factor");
  });
  it("does not elevate administrator sign-in without MFA", async () => {
    user.role = "ADMIN";
    await expect(socialSession(user, { provider: "apple", sub: "subject" })).rejects.toThrow(
      "password_login_required"
    );
  });
  it("marks explicit provider reauthentication separately from ordinary login", async () => {
    const response = await socialSession(user, { provider: "google", sub: "subject" }, true);
    const value = response.cookies.get("__Secure-next-auth.session-token")!.value;
    const token = await decode({ secret, token: value });
    expect(typeof token?.studioSocialReauthenticatedAt).toBe("number");
  });
});
