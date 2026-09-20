import { ErrorWithCode } from "@calcom/lib/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ webhook: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("@calcom/app-store/stripepayment/lib/MerchantTestCheckoutService", () => ({
  MerchantTestCheckoutService: class {
    webhook = mocks.webhook;
  },
}));
const params = { params: Promise.resolve({ connectionId: "60fe20f0-ded5-4d93-a75c-a1f4f85f08e7" }) };
const request = (body = "raw-body", signature = "signature") =>
  new Request("https://cal.example.test/api/stripe/studio-test/id", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.webhook.mockResolvedValue(undefined);
  vi.stubEnv("MERCHANT_STRIPE_TEST_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("studio webhook boundary", () => {
  it("is unavailable unless test mode is explicitly enabled", async () => {
    vi.stubEnv("MERCHANT_STRIPE_TEST_ENABLED", "false");
    expect((await POST(request(), params)).status).toBe(404);
    expect(mocks.webhook).not.toHaveBeenCalled();
  });
  it("requires a signature", async () => {
    expect((await POST(request("body", ""), params)).status).toBe(400);
    expect(mocks.webhook).not.toHaveBeenCalled();
  });
  it("passes the exact raw payload to signature verification", async () => {
    expect((await POST(request('{ "a" : 1 }'), params)).status).toBe(200);
    expect(mocks.webhook).toHaveBeenCalledWith(
      (await params.params).connectionId,
      '{ "a" : 1 }',
      "signature"
    );
  });
  it("limits body size even without a Content-Length header", async () => {
    expect((await POST(request("x".repeat(262145)), params)).status).toBe(413);
    expect(mocks.webhook).not.toHaveBeenCalled();
  });
  it("does not acknowledge a failed database/provider operation", async () => {
    mocks.webhook.mockRejectedValue(new Error("private provider details"));
    const response = await POST(request(), params);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
  it("rejects bad signatures without leaking errors", async () => {
    mocks.webhook.mockRejectedValue(ErrorWithCode.Factory.BadRequest("private signature details"));
    const response = await POST(request(), params);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
  });
});
