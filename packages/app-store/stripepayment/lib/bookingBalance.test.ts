import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  booking: vi.fn(),
  payments: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  lock: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
  intent: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        booking: { findFirst: m.booking },
        payment: { findMany: m.payments, create: m.create, update: m.update },
        $executeRaw: m.lock,
      }),
  },
}));
vi.mock("./server", () => ({
  default: { paymentIntents: { create: m.intent, retrieve: m.retrieve, cancel: m.cancel } },
}));

import { bookingBalance } from "./bookingBalance";

const data = { stripeAccount: "acct_studio", stripe_publishable_key: "pk_test_studio" };
const deposit = {
  id: 1,
  uid: "deposit-uid",
  externalId: "pi_deposit",
  amount: 3000,
  currency: "eur",
  success: true,
  refunded: false,
  data: { ...data, kind: "deposit", totalAmount: 10000, depositAmount: 3000 },
};
const balance = {
  id: 2,
  uid: "balance-uid",
  externalId: "pi_balance",
  amount: 7000,
  currency: "eur",
  success: false,
  refunded: false,
  data: { ...data, kind: "balance", depositPaymentId: 1, totalAmount: 10000 },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_PRIVATE_KEY", "sk_test_unit");
  m.booking.mockResolvedValue({ id: 7, status: "ACCEPTED" });
  m.payments.mockResolvedValue([deposit]);
  m.create.mockResolvedValue({ ...balance, externalId: "balance_pending_deposit-uid" });
  m.intent.mockResolvedValue({ id: "pi_balance", status: "requires_payment_method" });
  m.update.mockImplementation(async ({ data: changes }) => ({ ...balance, ...changes }));
  m.retrieve.mockResolvedValue({
    id: "pi_balance",
    amount: 7000,
    currency: "eur",
    metadata: { bookingId: "7" },
    livemode: false,
    status: "requires_payment_method",
  });
});
describe("booking balance", () => {
  it("scopes reads to the authenticated owner", async () => {
    m.booking.mockResolvedValue(null);
    await expect(bookingBalance("other-booking", 42, "link")).rejects.toThrow();
    expect(m.booking).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uid: "other-booking", userId: 42 } })
    );
    expect(m.payments).not.toHaveBeenCalled();
    expect(m.intent).not.toHaveBeenCalled();
  });
  it("reports paid and open amounts without creating payments", async () => {
    expect(await bookingBalance("booking", 42)).toMatchObject({
      total: 10000,
      paid: 3000,
      remaining: 7000,
      actionable: true,
    });
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each(["CANCELLED", "REJECTED", "PENDING"])("refuses collection for %s", async (status) => {
    m.booking.mockResolvedValue({ id: 7, status });
    await expect(bookingBalance("booking", 42, "link")).rejects.toThrow();
    expect(m.intent).not.toHaveBeenCalled();
  });
  it.each([{ success: false }, { refunded: true }])("requires a settled deposit: %j", async (change) => {
    m.payments.mockResolvedValue([{ ...deposit, ...change }]);
    await expect(bookingBalance("booking", 42, "studio")).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("creates a stable, idempotent balance intent in the original merchant account", async () => {
    expect(await bookingBalance("booking", 42, "link")).toMatchObject({
      link: "/payment/balance-uid",
      remaining: 7000,
    });
    expect(m.intent).toHaveBeenCalledWith(expect.objectContaining({ amount: 7000, currency: "eur" }), {
      stripeAccount: "acct_studio",
      idempotencyKey: "booking-balance-deposit-uid",
    });
  });
  it("reuses the existing link", async () => {
    m.payments.mockResolvedValue([deposit, balance]);
    expect(await bookingBalance("booking", 42, "link")).toMatchObject({ link: "/payment/balance-uid" });
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("cancels an open online attempt before recording studio payment", async () => {
    m.payments.mockResolvedValue([deposit, balance]);
    expect(await bookingBalance("booking", 42, "studio")).toMatchObject({
      remaining: 0,
      studio: true,
      link: null,
    });
    expect(m.cancel).toHaveBeenCalledWith("pi_balance", {}, { stripeAccount: "acct_studio" });
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          success: true,
          data: expect.objectContaining({ settledBy: 42, method: "studio" }),
        }),
      })
    );
  });
  it.each(["processing", "succeeded"])("refuses a manual duplicate when online is %s", async (status) => {
    m.payments.mockResolvedValue([deposit, balance]);
    m.retrieve.mockResolvedValue({
      id: "pi_balance",
      amount: 7000,
      currency: "eur",
      metadata: { bookingId: "7" },
      livemode: false,
      status,
    });
    await expect(bookingBalance("booking", 42, "studio")).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("does not mark as paid if cancellation fails", async () => {
    m.payments.mockResolvedValue([deposit, balance]);
    m.cancel.mockRejectedValue(new Error("already paying"));
    await expect(bookingBalance("booking", 42, "studio")).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("cannot collect a second balance after settlement", async () => {
    m.payments.mockResolvedValue([deposit, { ...balance, success: true }]);
    expect(await bookingBalance("booking", 42, "link")).toMatchObject({ remaining: 0, link: null });
    expect(m.intent).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});
