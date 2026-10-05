import { HttpError } from "@calcom/lib/http-error";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  current: vi.fn(),
  retrieve: vi.fn(),
  complete: vi.fn(),
  execute: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    payment: { findUnique: mocks.find },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRaw: mocks.execute,
        payment: { findUniqueOrThrow: mocks.current, update: mocks.update },
      }),
  },
}));
vi.mock("./server", () => ({ default: { paymentIntents: { retrieve: mocks.retrieve } } }));
vi.mock("@calcom/app-store/_utils/payments/handlePaymentSuccess", () => ({
  handlePaymentSuccess: mocks.complete,
}));
vi.mock("@calcom/lib/tracing/factory", () => ({ distributedTracing: { createTrace: vi.fn() } }));

import { verifyBookingIntent } from "./bookingPayment";
import { handleStripeBookingEvent } from "./bookingWebhook";

const payment = {
  id: 3,
  appId: "stripe",
  bookingId: 7,
  externalId: "pi_test",
  amount: 500,
  currency: "EUR",
  paymentOption: "ON_BOOKING",
  data: { stripeAccount: "acct_test", stripe_publishable_key: "pk_test_example" },
};
const intent = {
  id: "pi_test",
  amount: 500,
  amount_received: 500,
  currency: "eur",
  metadata: { bookingId: "7" },
  livemode: false,
  status: "succeeded",
} as Stripe.PaymentIntent;
const event = {
  id: "evt_test",
  type: "payment_intent.succeeded",
  account: "acct_test",
  livemode: false,
  data: { object: intent },
} as Stripe.Event;
const current = {
  success: false,
  refunded: false,
  data: payment.data,
  booking: { status: "PENDING", startTime: new Date("2099-01-01") },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(payment);
  mocks.current.mockResolvedValue(current);
  mocks.retrieve.mockResolvedValue(intent);
  mocks.complete.mockRejectedValue(new HttpError({ statusCode: 200, message: "complete" }));
});

describe("Stripe booking webhook", () => {
  it("retrieves the intent in the owning account and completes it once", async () => {
    await handleStripeBookingEvent(event);
    expect(mocks.retrieve).toHaveBeenCalledWith("pi_test", { stripeAccount: "acct_test" });
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { data: { ...payment.data, bookingFulfillmentComplete: true } } })
    );
    mocks.current.mockResolvedValue({
      ...current,
      success: true,
      data: { ...payment.data, bookingFulfillmentComplete: true },
    });
    await handleStripeBookingEvent({ ...event, id: "evt_other_delivery" });
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });
  it.each([
    { id: "pi_other" },
    { amount: 501 },
    { currency: "usd" },
    { metadata: { bookingId: "8" } },
    { livemode: true },
  ])("rejects a mismatched payment: %j", (change) => {
    expect(() => verifyBookingIntent({ ...intent, ...change }, payment, false)).toThrow();
  });
  it("rejects another merchant before retrieving or fulfilling", async () => {
    await expect(handleStripeBookingEvent({ ...event, account: "acct_other" })).rejects.toThrow();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it.each(["CANCELLED", "REJECTED"])("does not revive %s bookings", async (status) => {
    mocks.current.mockResolvedValue({ ...current, booking: { ...current.booking, status } });
    await expect(handleStripeBookingEvent(event)).rejects.toThrow();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("does not silently acknowledge incomplete fulfillment", async () => {
    mocks.current.mockResolvedValue({ ...current, success: true });
    await expect(handleStripeBookingEvent(event)).rejects.toThrow("fulfillment review");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("requests a retry when a booking event arrives before the database write", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(handleStripeBookingEvent(event)).rejects.toThrow("not persisted");
  });
  it("ignores unrelated merchant payments and event types", async () => {
    mocks.find.mockResolvedValue(null);
    await handleStripeBookingEvent({ ...event, data: { object: { ...intent, metadata: {} } } });
    await handleStripeBookingEvent({ ...event, type: "customer.created" });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("does not mark fulfillment complete on a handler failure", async () => {
    mocks.complete.mockRejectedValue(new Error("calendar failed"));
    await expect(handleStripeBookingEvent(event)).rejects.toThrow("calendar failed");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
