import { describe, expect, it } from "vitest";
import { serviceDisplayPriceSchema } from "./serviceDisplayPrice";
import { EventTypeMetaDataSchema } from "./zod-utils";

describe("optional public service prices", () => {
  it("preserves existing event metadata and an exact minor-unit price", () => {
    const price = { enabled: true, amountMinor: 4990, currency: "EUR" };
    expect(EventTypeMetaDataSchema.parse({ serviceDisplayPrice: price, multipleDuration: [30, 60] })).toEqual(
      { serviceDisplayPrice: price, multipleDuration: [30, 60] }
    );
    expect(EventTypeMetaDataSchema.parse(null)).toBeNull();
    expect(EventTypeMetaDataSchema.parse({})).toEqual({});
  });
  it("can hide a price without losing its value, and supports zero", () => {
    expect(
      serviceDisplayPriceSchema.parse({ enabled: false, amountMinor: 4990, currency: "EUR" }).amountMinor
    ).toBe(4990);
    expect(
      serviceDisplayPriceSchema.safeParse({ enabled: true, amountMinor: 0, currency: "EUR" }).success
    ).toBe(true);
  });
  it.each([
    -1,
    1.5,
    100000000,
    Infinity,
    NaN,
    "4990",
    null,
    undefined,
  ])("rejects invalid minor-unit amount %s", (amountMinor) => {
    expect(serviceDisplayPriceSchema.safeParse({ enabled: true, amountMinor, currency: "EUR" }).success).toBe(
      false
    );
  });
  it("rejects unsupported currencies and missing activation", () => {
    expect(
      serviceDisplayPriceSchema.safeParse({ enabled: true, amountMinor: 100, currency: "<script>" }).success
    ).toBe(false);
    expect(serviceDisplayPriceSchema.safeParse({ amountMinor: 100, currency: "EUR" }).success).toBe(false);
  });
});
