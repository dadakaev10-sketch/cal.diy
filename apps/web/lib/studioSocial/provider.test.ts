import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  read: vi.fn(),
  consume: vi.fn(),
  create: vi.fn(),
  jwt: vi.fn(),
  apple: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("@calcom/features/auth/lib/studioSocialIdentity", async (original) => ({
  ...(await original<typeof import("@calcom/features/auth/lib/studioSocialIdentity")>()),
  readSocialProof: m.read,
  consumeSocialProof: m.consume,
  createSocialProof: m.create,
}));
vi.mock("@calcom/features/auth/lib/studioApple", () => ({
  appleReady: () => true,
  appleClientId: () => "com.fixmit.studio",
  appleRequest: m.apple,
}));
vi.mock("jose", () => ({ createRemoteJWKSet: vi.fn(() => ({})), jwtVerify: m.jwt }));

import { proofHash } from "@calcom/features/auth/lib/studioSocialIdentity";
import { finishProvider, startProvider } from "./provider";

const verifier = "v".repeat(43),
  client = "1234-fixture.apps.googleusercontent.com";
let state: { provider: "google" | "apple"; challenge: string; nonce: string; mode: "login" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_IOS_CLIENT_ID", client);
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "fixture-identity-encryption-key");
  state = { provider: "google", challenge: proofHash(verifier), nonce: "expected-nonce", mode: "login" };
  m.read.mockImplementation(async () => ({ row: { token: "hash", identifier: "stored" }, data: state }));
  m.create.mockResolvedValue("f".repeat(64));
  m.jwt.mockResolvedValue({
    payload: {
      sub: "subject",
      nonce: state.nonce,
      email: "owner@example.invalid",
      email_verified: true,
      name: "Owner",
    },
  });
  m.apple.mockResolvedValue({ refresh_token: "private-refresh", id_token: "exchange-token" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"id_token":"signed-token"}', { status: 200 }))
  );
});
describe("provider authorization boundary", () => {
  it("requests only identity scopes and PKCE for the native Google client", async () => {
    const result = await startProvider("google", state.challenge, "login");
    const url = new URL(result.authorizationURL!);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(new Set(url.searchParams.get("scope")!.split(" "))).toEqual(
      new Set(["openid", "email", "profile"])
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "com.googleusercontent.apps.1234-fixture:/oauthredirect"
    );
    expect(url.searchParams.has("access_type")).toBe(false);
  });
  it("validates Google's issuer, audience and algorithm and sends the original verifier", async () => {
    await finishProvider({ state: "s", verifier, code: "code" });
    expect(m.jwt).toHaveBeenCalledWith(
      "signed-token",
      expect.anything(),
      expect.objectContaining({
        audience: client,
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        algorithms: ["RS256"],
      })
    );
    const call = vi.mocked(fetch).mock.calls[0];
    const body = call[1]!.body as URLSearchParams;
    expect(body.get("code_verifier")).toBe(verifier);
    expect(body.has("client_secret")).toBe(false);
  });
  it("rejects a callback bound to another app verifier", async () => {
    await expect(finishProvider({ state: "s", verifier: "z".repeat(43), code: "code" })).rejects.toThrow(
      "invalid_social_proof"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a substituted nonce before creating any identity proof", async () => {
    m.jwt.mockResolvedValue({ payload: { sub: "subject", nonce: "other-nonce" } });
    await expect(finishProvider({ state: "s", verifier, code: "code" })).rejects.toThrow(
      "invalid_social_proof"
    );
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects invalid provider signatures", async () => {
    m.jwt.mockRejectedValue(new Error("invalid_signature"));
    await expect(finishProvider({ state: "s", verifier, code: "code" })).rejects.toThrow("invalid_signature");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not treat an unverified email claim as a verified address", async () => {
    m.jwt.mockResolvedValue({
      payload: { sub: "subject", nonce: state.nonce, email: "owner@example.invalid", email_verified: false },
    });
    await finishProvider({ state: "s", verifier, code: "code" });
    expect(m.create.mock.calls[0][1].identity.email).toBeUndefined();
  });
  it("requires Apple's code exchange to identify the same subject", async () => {
    state.provider = "apple";
    m.jwt
      .mockResolvedValueOnce({ payload: { sub: "owner", nonce: state.nonce } })
      .mockResolvedValueOnce({ payload: { sub: "different-owner" } });
    await expect(
      finishProvider({ state: "s", verifier, code: "code", idToken: "apple-token" })
    ).rejects.toThrow("invalid_social_proof");
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("keeps Apple's refresh token encrypted outside the client", async () => {
    state.provider = "apple";
    await finishProvider({ state: "s", verifier, code: "code", idToken: "apple-token" });
    const identity = m.create.mock.calls[0][1].identity;
    expect(identity.refresh).not.toBe("private-refresh");
    expect(identity.refresh).not.toContain("private-refresh");
  });
});
