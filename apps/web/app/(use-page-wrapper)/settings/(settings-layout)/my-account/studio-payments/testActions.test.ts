import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshStudioStripeTest, startStudioStripeTest } from "./testActions";

const mocks = vi.hoisted(() => ({ session: vi.fn(), start: vi.fn(), refresh: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: mocks.session }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@calcom/app-store/stripepayment/lib/MerchantTestCheckoutService", () => ({
  MerchantTestCheckoutService: class {
    start = mocks.start;
    refresh = mocks.refresh;
  },
}));
function form() {
  const value = new FormData();
  for (const [key, content] of Object.entries({
    teamId: "100",
    checkoutId: "20fe20f0-ded5-4d93-a75c-a1f4f85f08e7",
    totalMinor: "2000",
    prepaymentPercent: "50",
    userId: "999",
  }))
    value.set(key, content);
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MERCHANT_STRIPE_TEST_ENABLED", "true");
  mocks.session.mockResolvedValue({ user: { id: 10 } });
  mocks.start.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  mocks.refresh.mockResolvedValue({ status: "OPEN" });
});
afterEach(() => vi.unstubAllEnvs());
describe("test payment server actions", () => {
  it("uses the authenticated user, not a form-supplied actor", async () => {
    await startStudioStripeTest(form());
    expect(mocks.start).toHaveBeenCalledWith(10, 100, {
      id: "20fe20f0-ded5-4d93-a75c-a1f4f85f08e7",
      totalMinor: 2000,
      prepaymentPercent: 50,
    });
  });
  it("rejects anonymous checkout and status requests", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await startStudioStripeTest(form())).toHaveProperty("error");
    expect(await refreshStudioStripeTest(100, "id")).toHaveProperty("error");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("rejects both actions when test mode is disabled", async () => {
    vi.stubEnv("MERCHANT_STRIPE_TEST_ENABLED", "false");
    expect(await startStudioStripeTest(form())).toHaveProperty("error");
    expect(await refreshStudioStripeTest(100, "id")).toHaveProperty("error");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("does not return provider failures to the browser", async () => {
    mocks.start.mockRejectedValue(new Error("rk_test_secret"));
    expect(await startStudioStripeTest(form())).toEqual({ error: "merchant_stripe_test_failed" });
  });
});
