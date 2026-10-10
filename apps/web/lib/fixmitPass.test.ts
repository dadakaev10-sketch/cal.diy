import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), remote: vi.fn() }));
vi.mock("@calcom/prisma", () => ({
  default: {
    $queryRaw: m.query,
    $executeRaw: m.execute,
    $transaction: (fn: (tx: object) => unknown) => fn({ $queryRaw: m.query, $executeRaw: m.execute }),
  },
}));
vi.mock("./fixmitPaypal", () => ({
  accountReference: (id: number) => `user-${id}`,
  paypalRequest: m.remote,
}));

import { activePass, createPass, passExpiry, passWebhook, syncPass } from "./fixmitPass";

const now = new Date("2026-10-10T12:00:00Z");
const row = {
  requestId: "12345678-1234-1234-1234-123456789012",
  userId: 7,
  orderId: "ORDER1",
  captureId: null,
  status: "CREATED",
  accessUntil: null,
  checkedAt: null,
  createdAt: now,
};
const order = {
  id: "ORDER1",
  intent: "CAPTURE",
  status: "COMPLETED",
  purchase_units: [
    {
      custom_id: "user-7",
      amount: { currency_code: "USD", value: "0.50" },
      payments: { captures: [{ id: "CAPTURE1" }] },
    },
  ],
};
const payment = {
  id: "CAPTURE1",
  status: "COMPLETED",
  amount: { currency_code: "USD", value: "0.50" },
  create_time: now.toISOString(),
  supplementary_data: { related_ids: { order_id: "ORDER1" } },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  m.query.mockResolvedValue([row]);
  m.remote.mockImplementation(async (path: string) =>
    path.includes("/payments/captures/") ? payment : order
  );
});
afterEach(() => vi.useRealTimers());
describe("One-time access security", () => {
  it("grants exactly 30 days from captured payment and replay never extends it", async () => {
    const first = await syncPass("ORDER1", 7);
    expect(first.accessUntil).toEqual(new Date("2026-11-09T12:00:00Z"));
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    expect((await syncPass("ORDER1", 7)).accessUntil).toEqual(first.accessUntil);
  });
  it.each([
    "CREATED",
    "APPROVED",
    "PAYER_ACTION_REQUIRED",
  ])("does not grant access for %s orders", async (status) => {
    m.remote.mockResolvedValue({
      ...order,
      status,
      purchase_units: [{ custom_id: "user-7", amount: payment.amount }],
    });
    expect((await syncPass("ORDER1", 7)).accessUntil).toBeNull();
  });
  it.each([
    "PENDING",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
    "DECLINED",
    "FAILED",
  ])("does not grant access for %s captures", async (status) => {
    m.remote.mockImplementation(async (path: string) =>
      path.includes("/payments/") ? { ...payment, status } : order
    );
    expect((await syncPass("ORDER1", 7)).accessUntil).toBeNull();
  });
  it("rejects another account before contacting PayPal", async () => {
    await expect(syncPass("ORDER1", 8, true)).rejects.toThrow();
    expect(m.remote).not.toHaveBeenCalled();
  });
  it.each([
    { ...order, id: "OTHER" },
    { ...order, purchase_units: [{ ...order.purchase_units[0], custom_id: "user-8" }] },
    {
      ...order,
      purchase_units: [{ ...order.purchase_units[0], amount: { currency_code: "EUR", value: "0.50" } }],
    },
    {
      ...order,
      purchase_units: [{ ...order.purchase_units[0], amount: { currency_code: "USD", value: "0.01" } }],
    },
    { ...order, purchase_units: [...order.purchase_units, ...order.purchase_units] },
    {
      ...order,
      purchase_units: [
        { ...order.purchase_units[0], payments: { captures: [{ id: "CAPTURE1" }, { id: "CAPTURE2" }] } },
      ],
    },
  ])("rejects manipulated or ambiguous orders", async (remote) => {
    m.remote.mockResolvedValue(remote);
    await expect(syncPass("ORDER1", 7)).rejects.toThrow();
    expect(m.execute).not.toHaveBeenCalled();
  });
  it.each([
    { ...payment, id: "OTHER" },
    { ...payment, amount: { currency_code: "USD", value: "0.01" } },
    { ...payment, supplementary_data: { related_ids: { order_id: "OTHER" } } },
    { ...payment, create_time: "2027-01-01T00:00:00Z" },
  ])("rejects mismatched captures", async (remote) => {
    m.remote.mockImplementation(async (path: string) => (path.includes("/payments/") ? remote : order));
    await expect(syncPass("ORDER1", 7)).rejects.toThrow();
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("captures approved orders with a stable idempotency key", async () => {
    m.remote
      .mockResolvedValueOnce({ ...order, status: "APPROVED" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(payment);
    expect((await syncPass("ORDER1", 7, true)).status).toBe("COMPLETED");
    expect(m.remote).toHaveBeenCalledWith(
      "/v2/checkout/orders/ORDER1/capture",
      expect.objectContaining({
        method: "POST",
        headers: { "PayPal-Request-Id": `${row.requestId.slice(0, 28)}-capture` },
      })
    );
  });
  it("reuses an unfinished order", async () => {
    expect(await createPass(7)).toBe("ORDER1");
    expect(m.remote).not.toHaveBeenCalled();
  });
  it("creates fixed-price CAPTURE orders with guest checkout and no billing agreement", async () => {
    m.query.mockResolvedValue([]);
    m.remote.mockResolvedValue({ id: "ORDER2" });
    expect(await createPass(7)).toBe("ORDER2");
    const body = JSON.parse(m.remote.mock.calls[0][1].body);
    expect(body).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [{ custom_id: "user-7", amount: { currency_code: "USD", value: "0.50" } }],
      payment_source: {
        paypal: {
          experience_context: { landing_page: "GUEST_CHECKOUT", shipping_preference: "NO_SHIPPING" },
        },
      },
    });
    expect(body).not.toHaveProperty("plan_id");
  });
  it("denies expired access even if returned from storage", async () => {
    m.query.mockResolvedValue([
      { ...row, status: "COMPLETED", accessUntil: new Date("2026-10-09"), checkedAt: now },
    ]);
    expect(await activePass(7)).toBeUndefined();
  });
  it("never reactivates a refunded pass from delayed completed events", async () => {
    m.query.mockResolvedValue([{ ...row, status: "REFUNDED", accessUntil: null }]);
    expect((await syncPass("ORDER1", 7)).accessUntil).toBeNull();
    expect(m.remote).not.toHaveBeenCalled();
  });
  it("matches refund events by their capture link and revokes access", async () => {
    await passWebhook("PAYMENT.CAPTURE.REFUNDED", {
      id: "REFUND1",
      links: [{ rel: "up", href: "https://api.paypal.com/v2/payments/captures/CAPTURE1" }],
    });
    expect(m.query.mock.calls[0]).toContain("CAPTURE1");
    expect(m.execute.mock.calls[0]).toContain("REFUNDED");
    expect(m.remote).not.toHaveBeenCalled();
  });
  it("captures a verified approved webhook without needing the browser callback", async () => {
    m.remote
      .mockResolvedValueOnce({ ...order, status: "APPROVED" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce(payment);
    await passWebhook("CHECKOUT.ORDER.APPROVED", { id: "ORDER1" });
    expect(m.execute).toHaveBeenCalled();
    expect(m.remote.mock.calls[1][0]).toMatch(/capture$/);
  });
  it("rejects invalid dates", () => {
    expect(() => passExpiry("bad")).toThrow();
  });
});
