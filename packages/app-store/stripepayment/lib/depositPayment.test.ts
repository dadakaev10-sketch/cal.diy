import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  booking: vi.fn(),
  intent: vi.fn(),
  save: vi.fn(),
  lookup: vi.fn(),
  customer: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { create: m.intent };
  },
}));
vi.mock("@calcom/prisma", () => ({
  default: { booking: { findUniqueOrThrow: m.booking }, payment: { create: m.save, findFirst: m.lookup } },
}));
vi.mock("@calcom/features/tasker", () => ({ default: {} }));
vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({ BookingRepository: class {} }));
vi.mock("./customer", () => ({ retrieveOrCreateStripeCustomerByEmail: m.customer }));

import { BuildPaymentService } from "./PaymentService";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_PRIVATE_KEY", "sk_test_unit");
  vi.stubEnv("FIXMIT_STRIPE_DIRECT_ACCOUNT_ID", "");
  m.booking.mockResolvedValue({
    eventType: { metadata: { apps: { stripe: { depositMode: "percent", depositValue: 30 } } } },
  });
  m.customer.mockResolvedValue({ id: "cus_unit" });
  m.intent.mockResolvedValue({ id: "pi_unit", amount: 3000 });
  m.save.mockImplementation(async (args) => ({ ...args.data, id: 1 }));
});
describe("Stripe initial deposit creation", () => {
  it("charges only the deposit while persisting the original full price", async () => {
    const service = BuildPaymentService({
      key: { stripe_user_id: "acct_unit", stripe_publishable_key: "pk_test_unit", default_currency: "eur" },
    });
    await service.create(
      { amount: 10000, currency: "eur" },
      7,
      4,
      "studio",
      "Test",
      "ON_BOOKING",
      "test@example.invalid"
    );
    expect(m.intent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3000 }),
      expect.objectContaining({ stripeAccount: "acct_unit" })
    );
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 3000,
          data: expect.objectContaining({ kind: "deposit", totalAmount: 10000, depositAmount: 3000 }),
        }),
      })
    );
  });
  it("never sends a studio settlement to Stripe for an automatic refund", async () => {
    m.lookup.mockResolvedValue({
      externalId: "pi_cancelled",
      success: true,
      data: { kind: "balance", method: "studio" },
    });
    const service = BuildPaymentService({
      key: { stripe_user_id: "acct_unit", stripe_publishable_key: "pk_test_unit", default_currency: "eur" },
    });
    expect(await service.refund(2)).toBeNull();
  });
  it("does not charge an invalid deposit configuration", async () => {
    m.booking.mockResolvedValue({
      eventType: { metadata: { apps: { stripe: { depositMode: "fixed", depositValue: 12000 } } } },
    });
    const service = BuildPaymentService({
      key: { stripe_user_id: "acct_unit", stripe_publishable_key: "pk_test_unit", default_currency: "eur" },
    });
    await expect(
      service.create(
        { amount: 10000, currency: "eur" },
        7,
        4,
        "studio",
        "Test",
        "ON_BOOKING",
        "test@example.invalid"
      )
    ).rejects.toThrow();
    expect(m.intent).not.toHaveBeenCalled();
  });
});
