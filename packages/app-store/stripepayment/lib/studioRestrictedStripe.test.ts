import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  account: vi.fn(),
  probe: vi.fn(),
  endpoint: vi.fn(),
  remove: vi.fn(),
  rows: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  disconnect: vi.fn(),
  find: vi.fn(),
  findMany: vi.fn(),
  lock: vi.fn(),
  pending: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: m.account };
    balance = { retrieve: m.probe };
    customers = { list: m.probe };
    paymentIntents = { list: m.probe };
    refunds = { list: m.probe };
    checkout = { sessions: { list: m.probe } };
    webhookEndpoints = { create: m.endpoint, del: m.remove };
  },
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    credential: { findMany: m.findMany, findFirst: m.find, updateMany: m.disconnect },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: m.lock,
        credential: { findMany: m.rows, create: m.create, update: m.update, updateMany: m.disconnect },
        payment: { findFirst: m.pending },
      }),
  },
}));

import {
  connectRestrictedStripe,
  disconnectRestrictedStripe,
  restrictedInput,
} from "./studioRestrictedStripe";
import { openStripe, sealStripe } from "./studioStripeVault";

const input = { apiKey: "rk_test_abcdefghijklmnop", publishableKey: "pk_test_abcdefghijklmnop" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "x".repeat(32));
  vi.stubEnv("WEBAPP_URL", "https://fixmit.com");
  vi.stubEnv("FIXMIT_STRIPE_DIRECT_ACCOUNT_ID", "acct_amina");
  vi.stubEnv("FIXMIT_STRIPE_DIRECT_USER_ID", "42");
  m.account.mockResolvedValue({ id: "acct_other", default_currency: "eur", charges_enabled: true });
  m.probe.mockResolvedValue({});
  m.endpoint.mockResolvedValue({ id: "we_test", secret: "whsec_onlyserver" });
  m.rows.mockResolvedValue([]);
  m.findMany.mockResolvedValue([]);
  m.disconnect.mockResolvedValue({ count: 1 });
  m.pending.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("restricted studio onboarding", () => {
  it("rejects unrestricted keys and unexpected fields", () => {
    expect(restrictedInput.safeParse({ ...input, apiKey: "sk_test_abcdefghijklmnop" }).success).toBe(false);
    expect(restrictedInput.safeParse({ ...input, userId: 99 }).success).toBe(false);
  });
  it("rejects mixed modes before any Stripe call", async () => {
    await expect(
      connectRestrictedStripe(7, { ...input, publishableKey: "pk_live_abcdefghijklmnop" })
    ).rejects.toThrow("stripe_key_mode_mismatch");
    expect(m.account).not.toHaveBeenCalled();
  });
  it("does not connect a live account that is not activated", async () => {
    m.account.mockResolvedValue({ id: "acct_other", charges_enabled: false });
    await expect(
      connectRestrictedStripe(7, {
        ...input,
        apiKey: "rk_live_abcdefghijklmnop",
        publishableKey: "pk_live_abcdefghijklmnop",
      })
    ).rejects.toThrow("stripe_verification_required");
    expect(m.endpoint).not.toHaveBeenCalled();
  });
  it("preserves the existing Amina connection", async () => {
    m.account.mockResolvedValue({ id: "acct_amina", charges_enabled: true });
    await expect(connectRestrictedStripe(42, input)).rejects.toThrow("stripe_existing_direct_connection");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects account reuse by a different studio or a team", async () => {
    for (const owner of [8, null]) {
      m.rows.mockResolvedValue([{ id: 1, userId: owner, key: {}, invalid: false }]);
      await expect(connectRestrictedStripe(7, input)).rejects.toThrow("stripe_account_unavailable");
    }
    expect(m.endpoint).not.toHaveBeenCalled();
  });
  it("does not create an endpoint when resource permissions are missing", async () => {
    m.probe.mockRejectedValue(new Error("permission denied"));
    await expect(connectRestrictedStripe(7, input)).rejects.toThrow();
    expect(m.endpoint).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("creates a tenant-specific webhook and stores only encrypted secrets", async () => {
    const result = await connectRestrictedStripe(7, input);
    const data = m.create.mock.calls[0][0].data;
    expect(JSON.stringify(data.key)).not.toMatch(/rk_test|whsec_/);
    expect(openStripe(data.encryptedKey, 7, "acct_other")).toEqual({
      apiKey: input.apiKey,
      webhookSecret: "whsec_onlyserver",
    });
    expect(m.endpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(
          /^https:\/\/fixmit.com\/api\/integrations\/stripepayment\/studio-webhook\/[a-f0-9]{48}$/
        ),
        enabled_events: ["payment_intent.succeeded"],
      })
    );
    expect(JSON.stringify(result)).not.toMatch(/rk_test|whsec_|encryptedKey/);
  });
  it("cleans up its remote endpoint when persistence fails", async () => {
    m.create.mockRejectedValueOnce(new Error("database down"));
    await expect(connectRestrictedStripe(7, input)).rejects.toThrow();
    expect(m.remove).toHaveBeenCalledWith("we_test");
  });
  it("prevents duplicate active connections", async () => {
    m.rows.mockResolvedValue([{ id: 1, userId: 7, key: {}, invalid: false }]);
    await expect(connectRestrictedStripe(7, input)).rejects.toThrow("stripe_already_connected");
  });
  it("does not rebind historical payments to a different Stripe account", async () => {
    m.rows.mockResolvedValue([{ id: 1, userId: 7, key: { stripe_user_id: "acct_old" }, invalid: true }]);
    await expect(connectRestrictedStripe(7, input)).rejects.toThrow("stripe_account_change_not_allowed");
  });
  it("keeps the signed webhook connected while online payments are outstanding", async () => {
    const key = {
      stripe_user_id: "acct_other",
      default_currency: "eur",
      stripe_publishable_key: input.publishableKey,
      fixmitConnection: "restricted",
      webhookEndpoint: "we_test",
      liveMode: false,
    };
    m.findMany.mockResolvedValue([{ id: 1, key }]);
    m.find.mockResolvedValue({
      id: 1,
      userId: 7,
      key,
      encryptedKey: sealStripe({ apiKey: input.apiKey, webhookSecret: "whsec_test" }, 7, "acct_other"),
    });
    m.pending.mockResolvedValue({ id: 123 });
    await expect(disconnectRestrictedStripe(7)).rejects.toThrow("stripe_pending_payments");
    expect(m.disconnect).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("removes local secrets even when remote endpoint cleanup fails", async () => {
    const key = {
      stripe_user_id: "acct_other",
      default_currency: "eur",
      stripe_publishable_key: input.publishableKey,
      fixmitConnection: "restricted",
      webhookEndpoint: "we_test",
      liveMode: false,
    };
    m.findMany.mockResolvedValue([{ id: 1, key }]);
    m.find.mockResolvedValue({
      id: 1,
      userId: 7,
      key,
      encryptedKey: sealStripe({ apiKey: input.apiKey, webhookSecret: "whsec_test" }, 7, "acct_other"),
    });
    m.remove.mockRejectedValueOnce(new Error("revoked key"));
    await expect(disconnectRestrictedStripe(7)).resolves.toEqual({ disconnected: true });
    expect(m.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 7 }),
        data: { invalid: true, encryptedKey: null },
      })
    );
  });
});
