import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    verificationToken: {
      create: m.create,
      findFirst: m.findFirst,
      findMany: m.findMany,
      deleteMany: m.deleteMany,
    },
    account: { update: m.update },
  },
}));

import { appleRequest, queueAppleRevocation, retryAppleRevocations, validAppleAccount } from "./studioApple";
import { sealSocial } from "./studioSocialIdentity";

const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "test-key-for-apple-token-storage");
  vi.stubEnv(
    "APPLE_SIGNIN_PRIVATE_KEY_BASE64",
    Buffer.from(keys.privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64")
  );
  vi.stubEnv("APPLE_SIGNIN_KEY_ID", "TESTKEY123");
  vi.stubEnv("APPLE_SIGNIN_TEAM_ID", "TESTTEAM12");
  vi.stubEnv("APPLE_SIGNIN_CLIENT_ID", "com.fixmit.studio");
  m.findMany.mockResolvedValue([]);
  m.findFirst.mockResolvedValue(null);
});
describe("Apple token lifecycle", () => {
  it("signs a short-lived ES256 client secret bound to the native app", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await appleRequest("revoke", { token: "test-refresh", token_type_hint: "refresh_token" });
    const body = fetch.mock.calls[0][1].body as URLSearchParams;
    const parts = body.get("client_secret")!.split(".");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(header).toEqual({ alg: "ES256", kid: "TESTKEY123" });
    expect(claims.sub).toBe("com.fixmit.studio");
    expect(claims.exp - claims.iat).toBe(600);
    expect(
      verify(
        "sha256",
        Buffer.from(parts.slice(0, 2).join(".")),
        { key: keys.publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(parts[2], "base64url")
      )
    ).toBe(true);
  });
  it("queues only encrypted revocation material for retry", async () => {
    const encrypted = sealSocial("private-refresh");
    await queueAppleRevocation(encrypted);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ identifier: "studio-apple-revoke:" + encrypted }),
      })
    );
    expect(JSON.stringify(m.create.mock.calls)).not.toContain("private-refresh");
  });
  it("retains queued revocations when Apple is temporarily unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":"temporarily_unavailable"}', { status: 503 }))
    );
    m.findMany.mockResolvedValue([{ id: 5, identifier: "studio-apple-revoke:" + sealSocial("refresh") }]);
    await retryAppleRevocations();
    expect(m.deleteMany).not.toHaveBeenCalledWith({ where: { id: 5 } });
  });
  it("removes a revocation job after Apple accepts it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    m.findMany.mockResolvedValue([{ id: 5, identifier: "studio-apple-revoke:" + sealSocial("refresh") }]);
    await retryAppleRevocations();
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 5 } });
  });
  it("does not make repeated refresh checks within a day", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await validAppleAccount({
        id: "a",
        refresh_token: sealSocial("refresh"),
        expires_at: Math.floor(Date.now() / 1000) + 1000,
      })
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("invalidates a provider session after consent is revoked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }))
    );
    expect(await validAppleAccount({ id: "a", refresh_token: sealSocial("refresh"), expires_at: 0 })).toBe(
      false
    );
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { refresh_token: null },
      select: { id: true },
    });
  });
});
