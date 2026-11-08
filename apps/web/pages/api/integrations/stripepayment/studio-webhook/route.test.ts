import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn(), raw: vi.fn(), handle: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { credential: { findFirst: m.find } } }));
vi.mock("raw-body", () => ({ default: m.raw }));
vi.mock("@calcom/app-store/stripepayment/lib/bookingWebhook", () => ({ handleStripeBookingEvent: m.handle }));

import { sealStripe } from "@calcom/app-store/stripepayment/lib/studioStripeVault";
import handler from "./[route]";

const stripe = new Stripe("sk_test_fixture", { apiVersion: "2020-08-27" }),
  route = "a".repeat(48),
  secret = "whsec_studioA";
let payload: string;
const event = {
  id: "evt_one",
  type: "payment_intent.succeeded",
  livemode: false,
  data: { object: { id: "pi_one" } },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "x".repeat(32));
  payload = JSON.stringify(event);
  m.raw.mockImplementation(async () => Buffer.from(payload));
  m.find.mockResolvedValue({
    userId: 7,
    key: {
      stripe_user_id: "acct_A",
      default_currency: "eur",
      stripe_publishable_key: "pk_test_A",
      fixmitConnection: "restricted",
      webhookRoute: route,
      liveMode: false,
    },
    encryptedKey: sealStripe({ apiKey: "rk_test_fixture", webhookSecret: secret }, 7, "acct_A"),
  });
});
afterEach(() => vi.unstubAllEnvs());
async function request(signingSecret = secret, method = "POST") {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler(
    {
      method,
      query: { route },
      headers: {
        "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret }),
      },
    } as unknown as NextApiRequest,
    res as unknown as NextApiResponse
  );
  return res;
}
describe("per-studio signed payment webhooks", () => {
  it("binds a valid event to the account selected by the endpoint", async () => {
    expect((await request()).status).toHaveBeenCalledWith(200);
    expect(m.handle).toHaveBeenCalledWith({ ...event, account: "acct_A" });
    expect(m.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ invalid: false, key: { path: ["webhookRoute"], equals: route } }),
      })
    );
  });
  it("rejects a webhook signed for another studio", async () => {
    expect((await request("whsec_studioB")).status).toHaveBeenCalledWith(400);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("rejects a conflicting account even with a valid signature", async () => {
    payload = JSON.stringify({ ...event, account: "acct_B" });
    expect((await request()).status).toHaveBeenCalledWith(400);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("rejects mixed live and sandbox events", async () => {
    payload = JSON.stringify({ ...event, livemode: true });
    expect((await request()).status).toHaveBeenCalledWith(400);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("rejects disconnected endpoints", async () => {
    m.find.mockResolvedValue(null);
    expect((await request()).status).toHaveBeenCalledWith(404);
    expect(m.handle).not.toHaveBeenCalled();
  });
  it("acknowledges only after successful processing, allowing Stripe retries", async () => {
    m.handle.mockRejectedValueOnce(new Error("fixture rk_test_never_expose"));
    const result = await request();
    expect(result.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(result.json.mock.calls)).not.toMatch(/rk_test/);
    expect((await request()).status).toHaveBeenCalledWith(200);
  });
  it("does not accept a non-POST request", async () => {
    expect((await request(secret, "GET")).status).toHaveBeenCalledWith(405);
    expect(m.find).not.toHaveBeenCalled();
  });
  it("rejects replayed signatures outside Stripe's timestamp tolerance", async () => {
    const res = { status: vi.fn(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
    res.status.mockReturnValue(res);
    await handler(
      {
        method: "POST",
        query: { route },
        headers: {
          "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1 }),
        },
      } as unknown as NextApiRequest,
      res as unknown as NextApiResponse
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(m.handle).not.toHaveBeenCalled();
  });
});
