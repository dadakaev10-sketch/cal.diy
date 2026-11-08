import { describe, expect, it } from "vitest";
import { ZCreateInputSchema } from "./create.schema";
import { ZUpdateInputSchema } from "./update.schema";

const metadata = (currency: string, mode: "fixed" | "percent" = "percent") => ({
  serviceDisplayPrice: { enabled: true, amountMinor: 7000, currency },
  apps: {
    stripe: {
      enabled: true,
      price: 7000,
      currency: currency.toLowerCase(),
      credentialId: 9001,
      paymentOption: "ON_BOOKING",
      depositMode: mode,
      depositValue: mode === "percent" ? 30 : 1500,
      refundPolicy: "never",
      autoChargeNoShowFeeIfCancelled: false,
      nativeExpectedRevision: "a".repeat(64),
    },
  },
});
describe("complete native service save input", () => {
  it.each([
    "eur",
    "usd",
    "gbp",
    "chf",
    "cad",
    "aud",
  ])("keeps deposit fields when parsing an update in %s", (currency) => {
    const parsed = ZUpdateInputSchema.parse({
      id: 9001,
      title: "Demo service",
      metadata: metadata(currency),
    });
    expect(parsed.metadata?.serviceDisplayPrice).toEqual({
      enabled: true,
      amountMinor: 7000,
      currency: currency.toUpperCase(),
    });
    expect(parsed.metadata?.apps?.stripe).toMatchObject({
      enabled: true,
      currency,
      price: 7000,
      depositMode: "percent",
      depositValue: 30,
      nativeExpectedRevision: "a".repeat(64),
    });
  });
  it("preserves a fixed deposit, amount and matching currency", () => {
    const parsed = ZUpdateInputSchema.parse({ id: 9001, metadata: metadata("USD", "fixed") });
    expect(parsed.metadata?.apps?.stripe).toMatchObject({
      currency: "usd",
      price: 7000,
      depositMode: "fixed",
      depositValue: 1500,
    });
  });
  it("rejects malformed currency rather than discarding payment metadata", () => {
    expect(ZUpdateInputSchema.safeParse({ id: 9001, metadata: metadata("<script>") }).success).toBe(false);
  });
  it("accepts the complete create payload for CAD and AUD", () => {
    for (const currency of ["CAD", "AUD"]) {
      const m = metadata(currency);
      delete (m.apps.stripe as Partial<typeof m.apps.stripe>).nativeExpectedRevision;
      const parsed = ZCreateInputSchema.parse({
        title: "Demo service",
        slug: "demo-service",
        length: 30,
        scheduleId: 9001,
        metadata: m,
        locations: [{ type: "inPerson", address: "Example Street" }],
      });
      expect(parsed.metadata?.serviceDisplayPrice?.currency).toBe(currency);
      expect(parsed.metadata?.apps?.stripe).toMatchObject({
        currency: currency.toLowerCase(),
        depositMode: "percent",
        depositValue: 30,
      });
    }
  });
});
