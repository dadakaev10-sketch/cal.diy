import { describe, expect, it } from "vitest";
import { createMerchantPaymentQuote } from "./merchantPaymentQuote";

describe("studio prepayment quote in EUR", () => {
  it.each([
    [0, 0, 2000],
    [30, 600, 1400],
    [50, 1000, 1000],
    [100, 2000, 0],
  ])("quotes %i percent of a 20 EUR service", (prepaymentPercent, dueNowMinor, remainingMinor) => {
    expect(createMerchantPaymentQuote({ totalMinor: 2000, currency: "eur", prepaymentPercent })).toEqual({
      totalMinor: 2000,
      currency: "eur",
      prepaymentPercent,
      dueNowMinor,
      remainingMinor,
    });
  });

  it("rounds to cents without losing the total", () => {
    const quote = createMerchantPaymentQuote({ totalMinor: 1999, currency: "eur", prepaymentPercent: 33 });
    expect(quote.dueNowMinor).toBe(660);
    expect(quote.dueNowMinor + quote.remainingMinor).toBe(1999);
  });

  it.each([
    -1,
    101,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid percentage %s", (prepaymentPercent) => {
    expect(() =>
      createMerchantPaymentQuote({ totalMinor: 2000, currency: "eur", prepaymentPercent })
    ).toThrow();
  });

  it.each([0, -1, 20.1, Number.NaN, 100_000_000])("rejects invalid total %s", (totalMinor) => {
    expect(() =>
      createMerchantPaymentQuote({ totalMinor, currency: "eur", prepaymentPercent: 30 })
    ).toThrow();
  });

  it("rejects a nonzero deposit below the EUR minimum", () => {
    expect(() =>
      createMerchantPaymentQuote({ totalMinor: 2000, currency: "eur", prepaymentPercent: 1 })
    ).toThrow("0.50");
  });
});
