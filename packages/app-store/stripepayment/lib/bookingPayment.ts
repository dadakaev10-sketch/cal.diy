import { HttpError } from "@calcom/lib/http-error";
import type Stripe from "stripe";
import { z } from "zod";

export const bookingStripeData = z.object({
  stripeAccount: z.string().startsWith("acct_"),
  stripe_publishable_key: z.string().startsWith("pk_"),
});

export function verifyBookingIntent(
  intent: Stripe.PaymentIntent,
  payment: { externalId: string; amount: number; currency: string; bookingId: number },
  live: boolean
) {
  if (
    intent.id !== payment.externalId ||
    intent.amount !== payment.amount ||
    intent.currency.toLowerCase() !== payment.currency.toLowerCase() ||
    intent.metadata.bookingId !== String(payment.bookingId) ||
    intent.livemode !== live
  ) {
    throw new HttpError({ statusCode: 400, message: "Payment does not match booking" });
  }
}
