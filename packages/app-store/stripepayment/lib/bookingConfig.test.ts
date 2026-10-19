import { afterEach, describe, expect, it, vi } from "vitest";
import { assertStripeBookingAccount, stripeBookingEnabled, stripeBookingLiveMode } from "./bookingConfig";

afterEach(() => vi.unstubAllEnvs());
describe("Stripe booking configuration", () => {
  it("keeps live payments blocked until explicitly enabled", () => {
    vi.stubEnv("STRIPE_PRIVATE_KEY", "rk_live_example");
    vi.stubEnv("FIXMIT_STRIPE_BOOKING_LIVE_ENABLED", "");
    expect(stripeBookingLiveMode()).toBe(true);
    expect(stripeBookingEnabled()).toBe(false);
    vi.stubEnv("FIXMIT_STRIPE_BOOKING_LIVE_ENABLED", "true");
    expect(stripeBookingEnabled()).toBe(true);
  });
  it("requires an actual key even if the live flag is set", () => {
    vi.stubEnv("STRIPE_PRIVATE_KEY", "");
    vi.stubEnv("FIXMIT_STRIPE_BOOKING_LIVE_ENABLED", "true");
    expect(stripeBookingEnabled()).toBe(false);
  });
  it("isolates the direct studio account and owner", () => {
    vi.stubEnv("STRIPE_PRIVATE_KEY", "rk_test_example");
    vi.stubEnv("FIXMIT_STRIPE_DIRECT_ACCOUNT_ID", "acct_studio");
    vi.stubEnv("FIXMIT_STRIPE_DIRECT_USER_ID", "42");
    expect(() => assertStripeBookingAccount("acct_studio", 42)).not.toThrow();
    expect(() => assertStripeBookingAccount("acct_studio", 43)).toThrow();
    expect(() => assertStripeBookingAccount("acct_other", 42)).toThrow();
  });
});
