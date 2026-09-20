import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  send: vi.fn(),
  hash: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: mocks.user },
    resetPasswordRequest: { create: mocks.create, deleteMany: mocks.remove },
    $queryRaw: mocks.query,
    $executeRaw: mocks.execute,
    $transaction: mocks.transaction,
  },
}));
vi.mock("@calcom/emails/templates/forgot-password-email", () => ({
  default: class {
    sendEmail = mocks.send;
  },
}));
vi.mock("@calcom/i18n/server", () => ({ getTranslation: vi.fn().mockResolvedValue(() => "text") }));
vi.mock("@calcom/lib/auth/hashPassword", () => ({ hashPassword: mocks.hash }));

import {
  studioAccountRateLimit,
  studioTokenHash,
  validStudioCsrf,
  validStudioOrigin,
  validStudioPassword,
} from "./studioAccountSecurity";
import { requestStudioPasswordRecovery, resetStudioPassword } from "./studioPasswordRecovery";

const token = "a".repeat(64);
const password = "Long-Password-12345";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  vi.stubEnv("NEXTAUTH_URL", "https://test.local");
  mocks.query.mockResolvedValue([{ attempts: 1 }]);
  mocks.user.mockResolvedValue({
    id: 1,
    email: "owner@example.com",
    name: "Owner",
    locale: "de",
    locked: false,
    identityProvider: "CAL",
  });
  mocks.hash.mockResolvedValue("new-hash");
  mocks.find.mockResolvedValue({ email: "owner@example.com" });
  mocks.remove.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      resetPasswordRequest: { findFirst: mocks.find, deleteMany: mocks.remove },
      userPassword: { upsert: mocks.update },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    })
  );
});

describe("studio recovery", () => {
  it("stores only the hash and waits for strict delivery", async () => {
    await requestStudioPasswordRecovery("owner@example.com");
    const saved = mocks.create.mock.calls[0][0].data;
    expect(saved.id).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.expires.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
    expect(mocks.send).toHaveBeenCalledWith({ throwOnError: true });
  });
  it.each([
    null,
    { locked: true },
    { identityProvider: "GOOGLE" },
  ])("does not send for ineligible users", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(requestStudioPasswordRecovery("owner@example.com")).resolves.toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not invalidate another link when delivery fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockRejectedValue(new Error("private SMTP information"));
    await requestStudioPasswordRecovery("owner@example.com");
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: mocks.create.mock.calls[0][0].data.id } });
    expect(log).toHaveBeenCalledWith("STUDIO_PASSWORD_RECOVERY_DELIVERY_FAILED");
    log.mockRestore();
  });
  it("throttles known and unknown emails before lookup", async () => {
    mocks.query.mockResolvedValue([{ attempts: 4 }]);
    await requestStudioPasswordRecovery("unknown@example.com");
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("fails closed when counters are unavailable", async () => {
    mocks.query.mockRejectedValue(new Error("offline"));
    await expect(studioAccountRateLimit("reset", "ip", 20)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("consumes the token and changes the password in one transaction", async () => {
    expect(await resetStudioPassword(token, password)).toBe(true);
    expect(mocks.find).toHaveBeenCalledWith({
      where: { id: studioTokenHash(token), expires: { gt: expect.any(Date) } },
      select: { email: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { userId: 1 },
      create: { userId: 1, hash: "new-hash" },
      update: { hash: "new-hash" },
      select: { userId: true },
    });
    expect(mocks.remove).toHaveBeenLastCalledWith({ where: { email: "owner@example.com" } });
  });
  it("rejects an expired or already consumed token", async () => {
    mocks.find.mockResolvedValue(null);
    expect(await resetStudioPassword(token, password)).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("loses a concurrent claim without changing the password", async () => {
    mocks.remove.mockResolvedValue({ count: 0 });
    expect(await resetStudioPassword(token, password)).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("propagates a database write failure for transaction rollback", async () => {
    mocks.update.mockRejectedValue(new Error("write failed"));
    await expect(resetStudioPassword(token, password)).rejects.toThrow("write failed");
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it("rejects weak, oversized or malformed input before hashing", async () => {
    expect(await resetStudioPassword("bad", password)).toBe(false);
    expect(await resetStudioPassword(token, "short")).toBe(false);
    expect(validStudioPassword(`Aa1${"é".repeat(40)}`)).toBe(false);
    expect(mocks.hash).not.toHaveBeenCalled();
  });
  it("requires an exact trusted origin and a nonempty matching CSRF token", () => {
    expect(
      validStudioOrigin(new Request("https://test.local", { headers: { origin: "https://test.local" } }))
    ).toBe(true);
    expect(
      validStudioOrigin(new Request("https://test.local", { headers: { origin: "https://evil.local" } }))
    ).toBe(false);
    expect(validStudioCsrf("", undefined)).toBe(false);
    expect(validStudioCsrf(token, token)).toBe(true);
    expect(validStudioCsrf(token, "b".repeat(64))).toBe(false);
  });
});
