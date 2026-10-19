import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  find: vi.fn(),
  current: vi.fn(),
  lock: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
  bookingCancel: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    payment: { findUnique: m.find },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ $executeRaw: m.lock, payment: { findUniqueOrThrow: m.current } }),
  },
}));
vi.mock("./server", () => ({ default: { paymentIntents: { retrieve: m.retrieve, cancel: m.cancel } } }));
vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({ default: m.bookingCancel }));

import { cancelUnpaidBooking } from "./cancelUnpaidBooking";

const record = () => ({
  id: 1,
  externalId: "pi_test",
  amount: 3000,
  currency: "eur",
  bookingId: 7,
  appId: "stripe",
  paymentOption: "ON_BOOKING",
  success: false,
  refunded: false,
  data: { stripeAccount: "acct_test", stripe_publishable_key: "pk_test_unit" },
  booking: {
    uid: "booking-uid",
    status: "PENDING",
    paid: false,
    endTime: new Date("2099-01-01"),
    eventType: { disableCancelling: false, seatsPerTimeSlot: null },
    payment: [{ id: 1, success: false }],
  },
});
const intent = (status = "requires_payment_method") => ({
  id: "pi_test",
  amount: 3000,
  currency: "eur",
  metadata: { bookingId: "7" },
  livemode: false,
  amount_received: 0,
  status,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_PRIVATE_KEY", "sk_test_unit");
  m.find.mockResolvedValue({ id: 1 });
  m.current.mockResolvedValue(record());
  m.retrieve.mockResolvedValue(intent());
  m.cancel.mockResolvedValue({ status: "canceled" });
  m.bookingCancel.mockResolvedValue({ success: true });
});
describe("cancel unpaid checkout", () => {
  it("cancels Stripe before releasing the booking", async () => {
    await expect(cancelUnpaidBooking("uid")).resolves.toEqual({ cancelled: true });
    expect(m.cancel).toHaveBeenCalledWith(
      "pi_test",
      { cancellation_reason: "requested_by_customer" },
      { stripeAccount: "acct_test" }
    );
    expect(m.cancel.mock.invocationCallOrder[0]).toBeLessThan(m.bookingCancel.mock.invocationCallOrder[0]);
    expect(m.bookingCancel).toHaveBeenCalledWith({
      userId: -1,
      bookingData: {
        uid: "booking-uid",
        cancellationReason: "Checkout cancelled before payment",
        allRemainingBookings: false,
      },
    });
  });
  it.each(["processing", "succeeded", "requires_capture"])("rejects %s payments", async (status) => {
    m.retrieve.mockResolvedValue(intent(status));
    await expect(cancelUnpaidBooking("uid")).rejects.toThrow();
    expect(m.bookingCancel).not.toHaveBeenCalled();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("does not release a slot when Stripe cancellation races with payment", async () => {
    m.cancel.mockRejectedValue(new Error("intent changed"));
    await expect(cancelUnpaidBooking("uid")).rejects.toThrow();
    expect(m.bookingCancel).not.toHaveBeenCalled();
  });
  it("retries after Stripe cancellation without cancelling twice", async () => {
    m.retrieve.mockResolvedValue(intent("canceled"));
    await cancelUnpaidBooking("uid");
    expect(m.cancel).not.toHaveBeenCalled();
    expect(m.bookingCancel).toHaveBeenCalledOnce();
  });
  it("is idempotent after booking cancellation", async () => {
    const p = record();
    p.booking.status = "CANCELLED";
    m.current.mockResolvedValue(p);
    await cancelUnpaidBooking("uid");
    expect(m.bookingCancel).not.toHaveBeenCalled();
    expect(m.retrieve).not.toHaveBeenCalled();
  });
  it.each(["success", "refunded"])("rejects %s records", async (field) => {
    m.current.mockResolvedValue({ ...record(), [field]: true });
    await expect(cancelUnpaidBooking("uid")).rejects.toThrow();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("rejects balance payments", async () => {
    const p = record();
    m.current.mockResolvedValue({
      ...p,
      data: { ...p.data, kind: "balance", depositPaymentId: 3, totalAmount: 10000 },
    });
    await expect(cancelUnpaidBooking("uid")).rejects.toThrow();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("rejects a different Stripe amount", async () => {
    m.retrieve.mockResolvedValue({ ...intent(), amount: 7000 });
    await expect(cancelUnpaidBooking("uid")).rejects.toThrow();
    expect(m.cancel).not.toHaveBeenCalled();
  });
  it("rejects unknown payment tokens", async () => {
    m.find.mockResolvedValue(null);
    await expect(cancelUnpaidBooking("unknown")).rejects.toThrow();
    expect(m.retrieve).not.toHaveBeenCalled();
  });
});
