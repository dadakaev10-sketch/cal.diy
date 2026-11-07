import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const db = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { verificationToken: db } }));

import {
  assertSocialVerifier,
  consumeSocialProof,
  createSocialProof,
  openSocial,
  proofHash,
  readSocialProof,
  sealSocial,
} from "./studioSocialIdentity";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "test-social-encryption-key-32byte");
  vi.stubEnv("NEXTAUTH_SECRET", "test-social-session-secret");
  db.create.mockResolvedValue({ id: 1 });
  db.deleteMany.mockResolvedValue({ count: 1 });
});
describe("native OAuth proofs", () => {
  it("encrypts sensitive proof material and authenticates ciphertext", () => {
    const sealed = sealSocial("private-refresh-token");
    expect(sealed).not.toContain("private-refresh-token");
    expect(openSocial(sealed)).toBe("private-refresh-token");
    const parts = sealed.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => openSocial(parts.join("."))).toThrow();
  });
  it("binds a callback to its original PKCE verifier", () => {
    const verifier = "a".repeat(43);
    expect(() => assertSocialVerifier(proofHash(verifier), verifier)).not.toThrow();
    expect(() => assertSocialVerifier(proofHash(verifier), "b".repeat(43))).toThrow("invalid_social_proof");
  });
  it("stores only a hash of an unpredictable one-time token", async () => {
    const token = await createSocialProof("identity", { secret: "do-not-store-plain" });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const write = db.create.mock.calls[0][0];
    expect(write.data.token).not.toBe(token);
    expect(write.data.identifier).not.toContain("do-not-store-plain");
  });
  it("rejects expired proofs and wrong proof kinds", async () => {
    db.findUnique.mockResolvedValue({
      token: "hash",
      identifier: "studio-social:identity:" + sealSocial("{}"),
      expires: new Date(0),
    });
    await expect(readSocialProof("a".repeat(64), "identity", z.object({}))).rejects.toThrow(
      "social_proof_expired"
    );
    db.findUnique.mockResolvedValue({
      token: "hash",
      identifier: "studio-social:state:" + sealSocial("{}"),
      expires: new Date(Date.now() + 10000),
    });
    await expect(readSocialProof("a".repeat(64), "identity", z.object({}))).rejects.toThrow(
      "social_proof_expired"
    );
  });
  it("atomically rejects a replayed or concurrently consumed proof", async () => {
    db.deleteMany.mockResolvedValue({ count: 0 });
    await expect(consumeSocialProof({ token: "hash", identifier: "stored" })).rejects.toThrow(
      "social_proof_expired"
    );
  });
});
