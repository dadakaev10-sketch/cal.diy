import prisma from "@calcom/testing/lib/__mocks__/prismaMock";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantTestCheckoutService } from "./MerchantTestCheckoutService";
import { encryptMerchantStripeCredentials } from "./merchantCredentials";

const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), event: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: provider.create, retrieve: provider.retrieve } };
    webhooks = { constructEvent: provider.event };
  },
}));
const key = "ab".repeat(32);
const connectionId = "60fe20f0-ded5-4d93-a75c-a1f4f85f08e7";
const id = "20fe20f0-ded5-4d93-a75c-a1f4f85f08e7";
const owner = {
  id: 1,
  userId: 10,
  teamId: 100,
  role: MembershipRole.OWNER,
  accepted: true,
  customRoleId: null,
  createdAt: null,
  updatedAt: null,
};
const connection = {
  id: connectionId,
  teamId: 100,
  accountId: "acct_test",
  revision: 1,
  encryptedCredentials: encryptMerchantStripeCredentials(
    { teamId: 100, connectionId },
    {
      accountId: "acct_test",
      mode: "test",
      restrictedKey: "rk_test_fixture",
      publishableKey: "pk_test_fixture",
      webhookSecret: "whsec_fixture",
    },
    key
  ),
  verifiedAt: new Date(),
  updatedByUserId: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const checkout = {
  id,
  connectionId,
  createdByUserId: 10,
  totalMinor: 2000,
  dueNowMinor: 1000,
  prepaymentPercent: 50,
  currency: "eur",
  sessionId: null,
  paymentIntentId: null,
  status: "CREATING",
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 35 * 60_000),
  updatedAt: new Date(),
};
const session = {
  id: "cs_test_fixture",
  livemode: false,
  mode: "payment",
  status: "open",
  payment_status: "unpaid",
  url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
  client_reference_id: id,
  metadata: { testCheckoutId: id, connectionId },
  amount_total: 1000,
  currency: "eur",
  payment_intent: null,
};
const input = { id, totalMinor: 2000, prepaymentPercent: 50 };
const service = new MerchantTestCheckoutService(prisma, key, "https://cal.example.test");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.membership.findUnique.mockResolvedValue(owner);
  prisma.merchantStripeConnection.findUnique.mockResolvedValue(connection);
  prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue(null);
  prisma.merchantStripeTestCheckout.findUniqueOrThrow.mockResolvedValue({ ...checkout, status: "PAID" });
  prisma.merchantStripeTestCheckout.count.mockResolvedValue(0);
  prisma.merchantStripeTestCheckout.create.mockResolvedValue(checkout);
  prisma.$transaction.mockImplementation(async (operation) => {
    if (typeof operation !== "function") throw new Error("Unexpected transaction");
    return operation(prisma);
  });
  provider.create.mockResolvedValue(session);
  provider.retrieve.mockResolvedValue(session);
  provider.event.mockReturnValue({
    id: "evt_test",
    livemode: false,
    type: "checkout.session.completed",
    data: { object: session },
  });
});

describe("isolated studio sandbox checkout", () => {
  it.each([
    null,
    { ...owner, accepted: false },
    { ...owner, role: MembershipRole.MEMBER },
    { ...owner, role: MembershipRole.ADMIN },
  ])("rejects non-owners before touching payment data", async (membership) => {
    prisma.membership.findUnique.mockResolvedValue(membership);
    await expect(service.start(10, 100, input)).rejects.toThrow();
    expect(prisma.merchantStripeConnection.findUnique).not.toHaveBeenCalled();
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("rechecks ownership inside the persistence transaction", async () => {
    prisma.membership.findUnique.mockResolvedValueOnce(owner).mockResolvedValueOnce(null);
    await expect(service.start(10, 100, input)).rejects.toThrow();
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("persists an immutable quote and uses a stable idempotency key without Connect", async () => {
    await expect(service.start(10, 100, input)).resolves.toEqual({ url: session.url });
    expect(prisma.merchantStripeTestCheckout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dueNowMinor: 1000, totalMinor: 2000, connectionId }),
      })
    );
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 1000, currency: "eur" }),
          }),
        ],
      }),
      { idempotencyKey: `merchant-test-checkout:${id}` }
    );
  });
  it("retries ambiguous provider failures with the same persisted identity", async () => {
    prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue(checkout);
    provider.create.mockRejectedValueOnce(new Error("network error rk_test_do_not_leak"));
    await expect(service.start(10, 100, input)).rejects.toThrow("merchant_stripe_test_failed");
    await service.start(10, 100, input);
    expect(provider.create.mock.calls[0][1]).toEqual(provider.create.mock.calls[1][1]);
    expect(prisma.merchantStripeTestCheckout.create).not.toHaveBeenCalled();
  });
  it.each([
    { totalMinor: 2001 },
    { prepaymentPercent: 60 },
    { connectionId: "other" },
    { createdByUserId: 11 },
  ])("does not repurpose existing payment identity", async (change) => {
    prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue({ ...checkout, ...change });
    await expect(service.start(10, 100, input)).rejects.toThrow();
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("limits open test checkouts", async () => {
    prisma.merchantStripeTestCheckout.count.mockResolvedValue(3);
    await expect(service.start(10, 100, input)).rejects.toThrow("merchant_stripe_test_limit");
    expect(provider.create).not.toHaveBeenCalled();
  });
  it.each([
    "http://cal.example.test",
    "https://user:pass@cal.example.test",
    "https://cal.example.test/evil",
  ])("rejects unsafe callback origin %s", async (origin) => {
    await expect(
      new MerchantTestCheckoutService(prisma, key, origin).start(10, 100, input)
    ).rejects.toThrow();
    expect(provider.create).not.toHaveBeenCalled();
  });
  it.each([
    { livemode: true },
    { amount_total: 2000 },
    { url: "https://attacker.test" },
    { currency: "usd" },
    { metadata: {} },
  ])("rejects unexpected provider checkout data", async (change) => {
    provider.create.mockResolvedValue({ ...session, ...change });
    await expect(service.start(10, 100, input)).rejects.toThrow("merchant_stripe_test_failed");
    expect(prisma.merchantStripeTestCheckout.updateMany).not.toHaveBeenCalled();
  });
  it("rejects sub-minimum deposits before creating any payment", async () => {
    await expect(
      service.start(10, 100, { ...input, totalMinor: 50, prepaymentPercent: 1 })
    ).rejects.toThrow();
    expect(provider.create).not.toHaveBeenCalled();
  });
});

describe("payment status and signed events", () => {
  beforeEach(() => {
    prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue({
      ...checkout,
      sessionId: session.id,
      status: "OPEN",
    });
    provider.retrieve.mockResolvedValue({
      ...session,
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_test",
    });
  });
  it("does not permit a studio to read another studio's payment", async () => {
    prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue({ ...checkout, connectionId: "other" });
    await expect(service.refresh(10, 100, id)).rejects.toThrow();
    expect(provider.retrieve).not.toHaveBeenCalled();
  });
  it("marks payment paid only after Stripe confirms the exact quote", async () => {
    await expect(service.refresh(10, 100, id)).resolves.toEqual({ status: "PAID" });
    expect(prisma.merchantStripeTestCheckout.updateMany).toHaveBeenCalledWith({
      where: { id, connectionId, status: { not: "PAID" } },
      data: { status: "PAID", paymentIntentId: "pi_test" },
    });
  });
  it.each([
    { amount_total: 999 },
    { currency: "usd" },
    { livemode: true },
    { client_reference_id: "other" },
    { metadata: { testCheckoutId: id, connectionId: "other" } },
    { id: "cs_other" },
  ])("denies a mismatched paid session", async (change) => {
    provider.retrieve.mockResolvedValue({
      ...session,
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_test",
      ...change,
    });
    await expect(service.refresh(10, 100, id)).rejects.toThrow();
    expect(prisma.merchantStripeTestCheckout.updateMany).not.toHaveBeenCalled();
  });
  it("never marks an unpaid success redirect as paid", async () => {
    provider.retrieve.mockResolvedValue({ ...session, status: "complete" });
    prisma.merchantStripeTestCheckout.findUniqueOrThrow.mockResolvedValue({ ...checkout, status: "OPEN" });
    await expect(service.refresh(10, 100, id)).resolves.toEqual({ status: "OPEN" });
    expect(prisma.merchantStripeTestCheckout.updateMany).not.toHaveBeenCalled();
  });
  it("uses raw signed payload and the connection's own signing secret", async () => {
    await service.webhook(connectionId, "raw-payload", "signature");
    expect(provider.event).toHaveBeenCalledWith("raw-payload", "signature", "whsec_fixture");
    expect(provider.retrieve).toHaveBeenCalledWith(session.id);
  });
  it("rejects invalid signatures before querying payments", async () => {
    provider.event.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });
    await expect(service.webhook(connectionId, "body", "invalid")).rejects.toThrow("signature_invalid");
    expect(prisma.merchantStripeTestCheckout.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    { livemode: true },
    { account: "acct_connect" },
  ])("rejects live and Connect events", async (change) => {
    provider.event.mockReturnValue({ type: "checkout.session.completed", ...change });
    await expect(service.webhook(connectionId, "body", "sig")).rejects.toThrow();
    expect(provider.retrieve).not.toHaveBeenCalled();
  });
  it("asks for retry when an event beats checkout persistence", async () => {
    prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue(checkout);
    await expect(service.webhook(connectionId, "body", "sig")).rejects.toThrow("persistence pending");
  });
  it("does not downgrade paid payments on expired or repeated events", async () => {
    prisma.merchantStripeTestCheckout.findUnique.mockResolvedValue({
      ...checkout,
      sessionId: session.id,
      status: "PAID",
    });
    provider.retrieve.mockResolvedValue({ ...session, status: "expired" });
    await expect(service.refresh(10, 100, id)).resolves.toEqual({ status: "PAID" });
    expect(prisma.merchantStripeTestCheckout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, connectionId, status: { not: "PAID" } } })
    );
  });
});
