import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ credentials: vi.fn(), account: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { credential: { findMany: m.credentials } } }));
vi.mock("./server", () => ({ default: { accounts: { retrieve: m.account } } }));

import { requireStudioStripe, studioStripeStatus } from "./studioConnection";
import { paymentSettingsRevision, validateStudioPaymentSettings } from "./studioPaymentSettings";

const key = {
  stripe_user_id: "acct_studio",
  default_currency: "eur",
  stripe_publishable_key: "pk_test_owner",
  secret: "must-not-leak",
};
const settings = (patch: Record<string, unknown> = {}) => ({
  apps: {
    stripe: {
      enabled: true,
      price: 10000,
      currency: "eur",
      paymentOption: "ON_BOOKING",
      credentialId: 8,
      depositMode: "percent",
      depositValue: 30,
      ...patch,
    },
  },
});
beforeEach(() => {
  vi.stubEnv("STRIPE_PRIVATE_KEY", "rk_test_example");
  vi.stubEnv("FIXMIT_STRIPE_DIRECT_ACCOUNT_ID", "acct_studio");
  vi.stubEnv("FIXMIT_STRIPE_DIRECT_USER_ID", "42");
  vi.stubEnv("FIXMIT_STRIPE_CONNECT_SECRET_KEY", "");
  m.credentials.mockReset();
  m.credentials.mockResolvedValue([{ id: 8, key }]);
});
afterEach(() => vi.unstubAllEnvs());
describe("studio native payment settings", () => {
  it("returns only a safe status DTO", async () => {
    const result = await studioStripeStatus(42);
    expect(result).toMatchObject({
      connected: true,
      available: true,
      credentialId: 8,
      currency: "eur",
      mode: "direct",
      testMode: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|stripe_publishable_key|pk_test_owner/);
    expect(m.credentials).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 42 }) })
    );
  });
  it("does not make the direct studio account available to another owner", async () => {
    expect(await studioStripeStatus(43)).toMatchObject({
      connected: false,
      available: false,
      credentialId: null,
    });
    await expect(requireStudioStripe(43, 8)).rejects.toThrow("stripe_account_unavailable");
  });
  it("validates a percentage and normalizes the event price", async () =>
    expect(await validateStudioPaymentSettings(settings(), 42)).toEqual({ price: 10000, currency: "eur" }));
  it("validates a fixed deposit", async () =>
    expect(
      await validateStudioPaymentSettings(settings({ depositMode: "fixed", depositValue: 2500 }), 42)
    ).toEqual({ price: 10000, currency: "eur" }));
  it.each([
    { depositValue: 0 },
    { depositValue: 100 },
    { depositValue: NaN },
    { depositMode: "fixed", depositValue: 10000 },
    { depositMode: "fixed", depositValue: 1.5 },
    { price: 0 },
    { price: -100 },
    { price: 100.5 },
    { currency: "invalid" },
  ])("rejects invalid online settings %j", async (patch) =>
    await expect(validateStudioPaymentSettings(settings(patch), 42)).rejects.toThrow());
  it("disables online payment without losing the display price metadata", async () => {
    const metadata = settings({ enabled: false });
    expect(await validateStudioPaymentSettings(metadata, 42)).toEqual({ price: 0, currency: "eur" });
    expect(metadata.apps.stripe.price).toBe(10000);
  });
  it("allows unchanged non-Stripe metadata", async () => {
    expect(await validateStudioPaymentSettings(undefined, 42)).toBeNull();
    expect(
      await validateStudioPaymentSettings(
        { serviceDisplayPrice: { enabled: true, amountMinor: 9000, currency: "EUR" } },
        42
      )
    ).toBeNull();
  });
  it("rejects an unowned selected credential", async () => {
    m.credentials.mockResolvedValue([]);
    await expect(validateStudioPaymentSettings(settings({ credentialId: 99 }), 42)).rejects.toThrow();
    expect(m.credentials).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 99, userId: 42 }) })
    );
  });
  it("keeps revisions stable across JSON object order but invalidates changed settings", () => {
    const a = {
      metadata: { apps: { stripe: { price: 10000, depositValue: 30 } } },
      price: 10000,
      currency: "eur",
    };
    const b = {
      currency: "eur",
      price: 10000,
      metadata: { apps: { stripe: { depositValue: 30, price: 10000 } } },
    };
    expect(paymentSettingsRevision(a)).toBe(paymentSettingsRevision(b));
    expect(paymentSettingsRevision({ ...a, price: 12000 })).not.toBe(paymentSettingsRevision(a));
    expect(
      paymentSettingsRevision({ ...a, metadata: { apps: { stripe: { price: 10000, depositValue: 20 } } } })
    ).not.toBe(paymentSettingsRevision(a));
  });
});
