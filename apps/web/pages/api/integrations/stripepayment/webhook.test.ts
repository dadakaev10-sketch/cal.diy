import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ raw: vi.fn(), handle: vi.fn() }));
vi.mock("raw-body", () => ({ default: mocks.raw }));
vi.mock("@calcom/app-store/stripepayment/lib/bookingWebhook", () => ({
  handleStripeBookingEvent: mocks.handle,
}));

import handler from "./webhook";

const stripe = new Stripe("sk_test_unit", { apiVersion: "2020-08-27" });
const secret = "whsec_unit_test";
const payload = JSON.stringify({
  id: "evt_unit",
  type: "payment_intent.succeeded",
  livemode: false,
  account: "acct_unit",
  data: { object: { id: "pi_unit" } },
});
function response() {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
async function request(signature?: string, method = "POST") {
  const res = response();
  await handler(
    { method, headers: { "stripe-signature": signature } } as unknown as NextApiRequest,
    res as unknown as NextApiResponse
  );
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.stubEnv("STRIPE_PRIVATE_KEY", "sk_test_unit");
  mocks.raw.mockResolvedValue(Buffer.from(payload));
});
describe("signed Stripe endpoint", () => {
  it("accepts a correctly signed sandbox event", async () => {
    const res = await request(stripe.webhooks.generateTestHeaderString({ payload, secret }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.handle).toHaveBeenCalledTimes(1);
  });
  it.each([
    undefined,
    "bad",
    stripe.webhooks.generateTestHeaderString({ payload, secret: "wrong" }),
    stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1 }),
  ])("rejects missing, invalid, forged or expired signature", async (signature) => {
    expect((await request(signature)).status).toHaveBeenCalledWith(400);
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("rejects modified payloads", async () => {
    mocks.raw.mockResolvedValue(Buffer.from(payload.replace("acct_unit", "acct_other")));
    expect(
      (await request(stripe.webhooks.generateTestHeaderString({ payload, secret }))).status
    ).toHaveBeenCalledWith(400);
  });
  it("rejects live operation and GET", async () => {
    vi.stubEnv("STRIPE_PRIVATE_KEY", "sk_live_unit");
    expect((await request()).status).toHaveBeenCalledWith(503);
    expect((await request(undefined, "GET")).status).toHaveBeenCalledWith(405);
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("returns a retryable error when fulfillment fails", async () => {
    mocks.handle.mockRejectedValue(new Error("temporary"));
    expect(
      (await request(stripe.webhooks.generateTestHeaderString({ payload, secret }))).status
    ).toHaveBeenCalledWith(500);
  });
});
