import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn(), legacy: { tag: "amina" }, construct: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { credential: { findFirst: m.find } } }));
vi.mock("./server", () => ({ default: m.legacy }));
vi.mock("stripe", () => ({
  default: class {
    constructor(key: string) {
      m.construct(key);
    }
  },
}));

import { bookingClient, bookingLiveMode, restrictedCredential } from "./bookingClient";
import { openStripe, sealStripe } from "./studioStripeVault";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "a".repeat(32));
  vi.stubEnv("FIXMIT_STRIPE_DIRECT_ACCOUNT_ID", "acct_amina");
  vi.stubEnv("STRIPE_PRIVATE_KEY", "rk_live_amina");
});
afterEach(() => vi.unstubAllEnvs());
function row(owner = 7, account = "acct_other", liveMode = false) {
  return {
    id: 8,
    userId: owner,
    invalid: false,
    key: {
      stripe_user_id: account,
      default_currency: "eur",
      stripe_publishable_key: "pk_test_other",
      fixmitConnection: "restricted",
      liveMode,
    },
    encryptedKey: sealStripe(
      { apiKey: "rk_test_studiosecret", webhookSecret: "whsec_studiosecret" },
      owner,
      account
    ),
  };
}
describe("restricted studio vault and routing", () => {
  it("preserves Amina without loading another studio key", async () => {
    expect(await bookingClient("acct_amina")).toBe(m.legacy);
    expect(m.find).not.toHaveBeenCalled();
    expect(await bookingLiveMode("acct_amina")).toBe(true);
  });
  it("uses only the selected account's encrypted key", async () => {
    m.find.mockResolvedValue(row());
    await bookingClient("acct_other");
    expect(m.construct).toHaveBeenCalledWith("rk_test_studiosecret");
    expect(m.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: { path: ["stripe_user_id"], equals: "acct_other" } }),
      })
    );
  });
  it("does not fall back to Amina when disconnected or missing", async () => {
    m.find.mockResolvedValue(null);
    await expect(bookingClient("acct_other")).rejects.toThrow();
    expect(m.construct).not.toHaveBeenCalled();
  });
  it("rejects a legacy or forged credential without the restricted marker", async () => {
    const r = row();
    Reflect.deleteProperty(r.key, "fixmitConnection");
    m.find.mockResolvedValue(r);
    await expect(restrictedCredential("acct_other")).rejects.toThrow();
  });
  it("authenticates owner and account as associated encryption data", () => {
    const r = row();
    expect(() => openStripe(r.encryptedKey, 8, "acct_other")).toThrow();
    expect(() => openStripe(r.encryptedKey, 7, "acct_wrong")).toThrow();
  });
  it("encrypts with random nonces and never stores plaintext", () => {
    const r = row(),
      r2 = row();
    expect(r.encryptedKey).not.toBe(r2.encryptedKey);
    expect(r.encryptedKey).not.toMatch(/rk_test|whsec_/);
    expect(openStripe(r.encryptedKey, 7, "acct_other").apiKey).toBe("rk_test_studiosecret");
  });
  it("fails closed with a wrong encryption key or modified ciphertext", () => {
    const r = row();
    vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "b".repeat(32));
    expect(() => openStripe(r.encryptedKey, 7, "acct_other")).toThrow("stripe_account_unavailable");
  });
  it("never saves secrets without server encryption configured", () => {
    vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "");
    expect(() => row()).toThrow("stripe_vault_unavailable");
  });
  it("rejects unrestricted secret keys", () => {
    expect(() =>
      sealStripe({ apiKey: "sk_test_unrestricted", webhookSecret: "whsec_test" }, 7, "acct_other")
    ).toThrow();
  });
  it("does not borrow a global key when no legacy Amina account is configured", async () => {
    vi.stubEnv("FIXMIT_STRIPE_DIRECT_ACCOUNT_ID", "");
    m.find.mockResolvedValue(null);
    await expect(bookingClient("acct_other")).rejects.toThrow("stripe_account_unavailable");
    expect(m.construct).not.toHaveBeenCalled();
  });
  it("reads sandbox/live mode from this studio, independently of Amina", async () => {
    m.find.mockResolvedValue(row());
    expect(await bookingLiveMode("acct_other")).toBe(false);
    m.find.mockResolvedValue(row(7, "acct_other", true));
    expect(await bookingLiveMode("acct_other")).toBe(true);
  });
});
