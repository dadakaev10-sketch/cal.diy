import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
export function stripeBookingLiveMode() {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_PRIVATE_KEY || "");
}
export function stripeBookingEnabled() {
  const key = process.env.STRIPE_PRIVATE_KEY || "";
  return (
    /^(sk|rk)_test_/.test(key) ||
    (stripeBookingLiveMode() && process.env.FIXMIT_STRIPE_BOOKING_LIVE_ENABLED === "true")
  );
}
export function assertStripeBookingAccount(account: string, userId: number | null | undefined) {
  if (!stripeBookingEnabled())
    throw new ErrorWithCode(ErrorCode.BadRequest, "Stripe booking payments are not enabled");
  const direct = process.env.FIXMIT_STRIPE_DIRECT_ACCOUNT_ID;
  if (direct && (account !== direct || String(userId) !== process.env.FIXMIT_STRIPE_DIRECT_USER_ID)) {
    throw new ErrorWithCode(ErrorCode.Forbidden, "Stripe account is not configured for this studio");
  }
}
