import process from "node:process";
import { handleStripeBookingEvent } from "@calcom/app-store/stripepayment/lib/bookingWebhook";
import stripe from "@calcom/app-store/stripepayment/lib/server";
import { HttpError } from "@calcom/lib/http-error";
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.STRIPE_PRIVATE_KEY?.startsWith("sk_test_")) {
    return res.status(503).json({ message: "Booking payments are sandbox-only" });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  if (!secret) return res.status(503).json({ message: "Stripe not configured" });
  if (typeof signature !== "string") return res.status(400).end();
  let event;
  try {
    const raw = await getRawBody(req, { limit: "256kb" });
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return res.status(400).json({ message: "Invalid Stripe event" });
  }
  const live = process.env.STRIPE_PRIVATE_KEY?.startsWith("sk_live_") === true;
  if (event.livemode !== live) return res.status(400).end();
  try {
    await handleStripeBookingEvent(event);
    return res.status(200).json({ received: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.statusCode : 500;
    console.error("Stripe booking webhook failed", { eventId: event.id, status });
    return res.status(status).json({ message: "Stripe event not processed" });
  }
}
