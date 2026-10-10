import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  user: vi.fn(),
  guard: vi.fn(),
  remote: vi.fn(),
  sync: vi.fn(),
  create: vi.fn(),
  required: vi.fn(),
  entitled: vi.fn(),
  passCreate: vi.fn(),
  passSync: vi.fn(),
  passLatest: vi.fn(),
  passWebhook: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({ default: { $queryRaw: m.query } }));
vi.mock("@lib/fixmitBillingAuth", () => ({ billingUser: m.user }));
vi.mock("@lib/studioAccountRequest", () => ({
  guardStudioAccountRequest: m.guard,
  readStudioAccountBody: (req: Request) => req.json(),
}));
vi.mock("@lib/fixmitBilling", () => ({
  billingEnabled: () => true,
  createBilling: m.create,
  hasBillingAccess: (row: { active: boolean }) => row.active,
  paypalRequest: m.remote,
  syncBilling: m.sync,
  requiresBilling: m.required,
  entitled: m.entitled,
}));

vi.mock("@lib/fixmitPass", () => ({
  createPass: m.passCreate,
  syncPass: m.passSync,
  latestPass: m.passLatest,
  passWebhook: m.passWebhook,
}));

import { POST } from "./route";

const request = (body: object = {}) =>
  new NextRequest("https://test.local/api/fixmit-billing/create", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = (action: string) => ({ params: Promise.resolve({ action }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook");
  m.user.mockResolvedValue({ id: 7 });
  m.required.mockResolvedValue(true);
});
describe("PayPal billing endpoints", () => {
  it("requires authentication", async () => {
    m.user.mockResolvedValue(null);
    expect((await POST(request(), params("create"))).status).toBe(401);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("honours the origin/rate limit guard", async () => {
    m.guard.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(request(), params("create"))).status).toBe(403);
  });
  it("rejects checkout for grandfathered accounts", async () => {
    m.required.mockResolvedValue(false);
    expect((await POST(request(), params("create"))).status).toBe(409);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("ignores browser account and subscription IDs", async () => {
    m.sync.mockResolvedValue({ active: true });
    const result = await POST(request({ userId: 88, subscriptionID: "I-STOLEN" }), params("confirm"));
    expect(result.status).toBe(200);
    expect(m.sync).toHaveBeenCalledWith(7);
  });
  it("rejects forged webhooks without updating access", async () => {
    m.remote.mockResolvedValue({ verification_status: "FAILURE" });
    const result = await POST(
      request({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-TEST" } }),
      params("webhook")
    );
    expect(result.status).toBe(403);
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("refetches the current remote state for verified repeated or out-of-order events", async () => {
    m.remote.mockResolvedValue({ verification_status: "SUCCESS" });
    m.query.mockResolvedValue([{ userId: 7 }]);
    const body = { event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-TEST" } };
    expect((await POST(request(body), params("webhook"))).status).toBe(200);
    expect(m.sync).toHaveBeenCalledWith(7);
  });
  it("acknowledges unrelated subscriptions without assigning them", async () => {
    m.remote.mockResolvedValue({ verification_status: "SUCCESS" });
    m.query.mockResolvedValue([]);
    expect(
      (
        await POST(
          request({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-OTHER" } }),
          params("webhook")
        )
      ).status
    ).toBe(200);
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("returns retryable failure when verification is unavailable", async () => {
    m.remote.mockRejectedValue(new Error("offline"));
    expect(
      (
        await POST(
          request({ event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-TEST" } }),
          params("webhook")
        )
      ).status
    ).toBe(503);
  });
});

describe("One-time payment endpoints", () => {
  it.each(["pass-create", "pass-confirm"])("requires an authenticated account for %s", async (action) => {
    m.user.mockResolvedValue(null);
    expect((await POST(request(), params(action))).status).toBe(401);
    expect(m.passCreate).not.toHaveBeenCalled();
    expect(m.passSync).not.toHaveBeenCalled();
  });
  it("prevents purchasing another pass while access is active", async () => {
    m.entitled.mockResolvedValue(true);
    expect((await POST(request(), params("pass-create"))).status).toBe(409);
    expect(m.passCreate).not.toHaveBeenCalled();
  });
  it("binds confirmation to the authenticated user", async () => {
    m.passSync.mockResolvedValue({ status: "COMPLETED", accessUntil: new Date(Date.now() + 86400000) });
    const result = await POST(request({ orderId: "ORDER1", userId: 99 }), params("pass-confirm"));
    expect(await result.json()).toMatchObject({ active: true });
    expect(m.passSync).toHaveBeenCalledWith("ORDER1", 7, true);
  });
  it("does not unlock a pending capture", async () => {
    m.passSync.mockResolvedValue({ status: "PENDING", accessUntil: null });
    const result = await POST(request({ orderId: "ORDER1" }), params("pass-confirm"));
    expect(await result.json()).toMatchObject({ active: false });
  });
  it("can recover the latest order after the checkout window closes", async () => {
    m.passLatest.mockResolvedValue({ orderId: "ORDER1" });
    m.passSync.mockResolvedValue({ status: "APPROVED", accessUntil: null });
    await POST(request(), params("pass-confirm"));
    expect(m.passSync).toHaveBeenCalledWith("ORDER1", 7, true);
  });
  it("never processes unsigned capture events", async () => {
    m.remote.mockResolvedValue({ verification_status: "FAILURE" });
    expect(
      (
        await POST(
          request({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPTURE1" } }),
          params("webhook")
        )
      ).status
    ).toBe(403);
    expect(m.passWebhook).not.toHaveBeenCalled();
  });
  it("preserves capture links for verified refund processing", async () => {
    m.remote.mockResolvedValue({ verification_status: "SUCCESS" });
    const resource = {
      id: "REFUND1",
      links: [{ rel: "up", href: "https://api.paypal.com/v2/payments/captures/CAPTURE1" }],
    };
    expect(
      (await POST(request({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource }), params("webhook"))).status
    ).toBe(200);
    expect(m.passWebhook).toHaveBeenCalledWith("PAYMENT.CAPTURE.REFUNDED", resource);
  });
});
