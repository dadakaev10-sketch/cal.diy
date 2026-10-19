import { describe, expect, it } from "vitest";
import { calculateDeposit, depositSnapshotSchema } from "./deposit";

describe("booking deposits", () => {
  it("keeps the full price when disabled", () => expect(calculateDeposit(10000, undefined)).toBe(10000));
  it("calculates percentages in minor currency units", () => {
    expect(calculateDeposit(9999, { depositMode: "percent", depositValue: 30 })).toBe(3000);
  });
  it("uses a fixed minor-unit amount", () =>
    expect(calculateDeposit(10000, { depositMode: "fixed", depositValue: 2000 })).toBe(2000));
  it.each([0, -1, 100, 120, NaN])("rejects invalid percentage %s", (depositValue) =>
    expect(() => calculateDeposit(10000, { depositMode: "percent", depositValue })).toThrow());
  it.each([0, -1, 0.1, 10000, 12000])("rejects invalid fixed amount %s", (depositValue) =>
    expect(() => calculateDeposit(10000, { depositMode: "fixed", depositValue })).toThrow());
  it("rejects a rounded zero deposit", () =>
    expect(() => calculateDeposit(1, { depositMode: "percent", depositValue: 1 })).toThrow());
  it("rejects inconsistent stored balances", () =>
    expect(
      depositSnapshotSchema.safeParse({ kind: "deposit", totalAmount: 100, depositAmount: 120 }).success
    ).toBe(false));
});
