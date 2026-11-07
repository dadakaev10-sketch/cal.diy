import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  read: vi.fn(),
  consume: vi.fn(),
  factor: vi.fn(),
  session: vi.fn(),
  actor: vi.fn(),
  getUser: vi.fn(),
  passwordless: vi.fn(),
  account: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  user: { findFirst: vi.fn() },
  proofDelete: vi.fn(),
  regCreate: vi.fn(),
  regDelete: vi.fn(),
  complete: vi.fn(),
  queue: vi.fn(),
  retry: vi.fn(),
}));
vi.mock("@calcom/features/auth/lib/studioSocialIdentity", async (original) => {
  const actual = await original<typeof import("@calcom/features/auth/lib/studioSocialIdentity")>();
  return { ...actual, readSocialProof: m.read, consumeSocialProof: m.consume };
});
vi.mock("@calcom/features/auth/lib/studioApple", () => ({
  queueAppleRevocation: m.queue,
  retryAppleRevocations: m.retry,
}));
vi.mock("./session", () => ({
  actor: m.actor,
  getSocialUser: m.getUser,
  passwordless: m.passwordless,
  secondFactor: m.factor,
  socialSession: m.session,
}));
vi.mock("@calcom/features/auth/lib/studioRegistration", async (original) => {
  const actual = await original<typeof import("@calcom/features/auth/lib/studioRegistration")>();
  return { ...actual, completeStudioRegistration: m.complete };
});
vi.mock("@calcom/prisma", () => ({
  default: {
    account: m.account,
    user: m.user,
    studioRegistrationRequest: { create: m.regCreate, deleteMany: m.regDelete },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $executeRaw: vi.fn(), account: m.account, verificationToken: { deleteMany: m.proofDelete } }),
  },
}));

import { proofHash } from "@calcom/features/auth/lib/studioSocialIdentity";
import { NextRequest, NextResponse } from "next/server";
import { exchangeIdentity, unlink } from "./account";

const verifier = "a".repeat(43),
  request = new NextRequest("https://fixmit.com/api/studio-auth/exchange");
const identity = { provider: "google", sub: "subject", email: "owner@example.invalid" };
let proof: {
  row: { token: string; identifier: string };
  data: {
    provider: string;
    mode: string;
    challenge: string;
    nonce: string;
    actor?: number;
    identity: typeof identity;
  };
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STUDIO_REGISTRATION_ENABLED", "true");
  proof = {
    row: { token: "hash", identifier: "encrypted" },
    data: { provider: "google", mode: "login", challenge: proofHash(verifier), nonce: "nonce", identity },
  };
  m.read.mockImplementation(async () => proof);
  m.consume.mockResolvedValue(undefined);
  m.factor.mockResolvedValue(undefined);
  m.session.mockResolvedValue(NextResponse.json({ status: "signed_in" }));
  m.getUser.mockResolvedValue({ id: 9, locked: false, twoFactorEnabled: false });
  m.actor.mockResolvedValue({ user: { id: 9 }, token: {} });
  m.account.findUnique.mockResolvedValue(null);
  m.user.findFirst.mockResolvedValue(null);
  m.account.findMany.mockResolvedValue([]);
  m.proofDelete.mockResolvedValue({ count: 1 });
  m.passwordless.mockReturnValue(false);
});
describe("social account isolation", () => {
  it("does not auto-link an existing email address", async () => {
    m.user.findFirst.mockResolvedValue({ id: 9 });
    const result = await exchangeIdentity(request, { ticket: "t", verifier });
    expect(await result.json()).toEqual({ status: "account_link_required" });
    expect(m.account.upsert).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
  });
  it("starts studio onboarding only for a verified, unregistered identity", async () => {
    const result = await exchangeIdentity(request, { ticket: "t", verifier });
    expect(await result.json()).toMatchObject({ status: "onboarding_required", email: identity.email });
    expect(m.complete).not.toHaveBeenCalled();
  });
  it("signs in only the account attached to the stable provider subject", async () => {
    m.account.findUnique.mockResolvedValue({ id: "account", userId: 9 });
    await exchangeIdentity(request, { ticket: "t", verifier });
    expect(m.getUser).toHaveBeenCalledWith(9);
    expect(m.consume).toHaveBeenCalledTimes(1);
    expect(m.session).toHaveBeenCalledTimes(1);
  });
  it("keeps the proof pending until the second factor succeeds", async () => {
    m.account.findUnique.mockResolvedValue({ id: "account", userId: 9 });
    m.getUser.mockResolvedValue({ id: 9, locked: false, twoFactorEnabled: true });
    const result = await exchangeIdentity(request, { ticket: "t", verifier });
    expect(await result.json()).toEqual({ status: "two_factor_required", ticket: "t" });
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
  });
  it("never issues a session after a failed second factor", async () => {
    m.account.findUnique.mockResolvedValue({ id: "account", userId: 9 });
    m.factor.mockRejectedValue(new Error("invalid_second_factor"));
    await expect(exchangeIdentity(request, { ticket: "t", verifier, totp: "wrong" })).rejects.toThrow();
    expect(m.consume).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
  });
  it("rejects locked accounts", async () => {
    m.account.findUnique.mockResolvedValue({ id: "account", userId: 9 });
    m.getUser.mockResolvedValue({ id: 9, locked: true });
    await expect(exchangeIdentity(request, { ticket: "t", verifier })).rejects.toThrow("signin_required");
    expect(m.session).not.toHaveBeenCalled();
  });
  it("rejects linking a subject already owned by a different account", async () => {
    proof.data.mode = "link";
    proof.data.actor = 9;
    m.account.findUnique.mockResolvedValue({ id: "other", userId: 10 });
    await expect(exchangeIdentity(request, { ticket: "t", verifier })).rejects.toThrow(
      "identity_already_linked"
    );
    expect(m.account.upsert).not.toHaveBeenCalled();
  });
  it("binds reauthentication to the currently signed-in user", async () => {
    proof.data.mode = "reauth";
    proof.data.actor = 9;
    m.account.findUnique.mockResolvedValue({ id: "other", userId: 10 });
    m.getUser.mockResolvedValue({ id: 10, locked: false });
    await expect(exchangeIdentity(request, { ticket: "t", verifier })).rejects.toThrow("wrong_account");
    expect(m.session).not.toHaveBeenCalled();
  });
  it("requires recent authentication for linking", async () => {
    proof.data.mode = "link";
    proof.data.actor = 9;
    await exchangeIdentity(request, { ticket: "t", verifier });
    expect(m.actor).toHaveBeenCalledWith(request, true);
  });
  it("does not remove the last usable sign-in method", async () => {
    m.passwordless.mockReturnValue(true);
    m.account.findMany.mockResolvedValue([{ id: "only", provider: "studio-google", refresh_token: null }]);
    await expect(unlink(request, "google")).rejects.toThrow("last_signin_method");
    expect(m.account.delete).not.toHaveBeenCalled();
  });
  it("rejects callback proof replay before updating credentials", async () => {
    m.account.findUnique.mockResolvedValue({ id: "account", userId: 9 });
    m.consume.mockRejectedValue(new Error("social_proof_expired"));
    await expect(exchangeIdentity(request, { ticket: "t", verifier })).rejects.toThrow();
    expect(m.account.update).not.toHaveBeenCalled();
    expect(m.session).not.toHaveBeenCalled();
  });
});
