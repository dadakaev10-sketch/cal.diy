import { handleStripeBookingEvent } from "@calcom/app-store/stripepayment/lib/bookingWebhook";
import { bookingCredentialSchema } from "@calcom/app-store/stripepayment/lib/credentialSchema";
import { openStripe } from "@calcom/app-store/stripepayment/lib/studioStripeVault";
import { HttpError } from "@calcom/lib/http-error";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";
import Stripe from "stripe";
export const config = { api: { bodyParser: false } };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const route = req.query.route,
    signature = req.headers["stripe-signature"];
  if (typeof route !== "string" || !/^[a-f0-9]{48}$/.test(route) || typeof signature !== "string")
    return res.status(400).end();
  const row = await prisma.credential.findFirst({
    where: {
      appId: "stripe",
      type: "stripe_payment",
      invalid: false,
      key: { path: ["webhookRoute"], equals: route },
    },
    select: { key: true, encryptedKey: true, userId: true },
  });
  const parsed = bookingCredentialSchema.safeParse(row?.key);
  if (!row?.userId || !row.encryptedKey || !parsed.success || parsed.data.fixmitConnection !== "restricted")
    return res.status(404).end();
  let event: Stripe.Event;
  try {
    const secrets = openStripe(row.encryptedKey, row.userId, parsed.data.stripe_user_id);
    const client = new Stripe(secrets.apiKey, { apiVersion: "2020-08-27" });
    event = client.webhooks.constructEvent(
      await getRawBody(req, { limit: "256kb" }),
      signature,
      secrets.webhookSecret
    );
    if (
      (event.account && event.account !== parsed.data.stripe_user_id) ||
      event.livemode !== parsed.data.liveMode
    )
      return res.status(400).end();
  } catch {
    return res.status(400).json({ message: "Invalid Stripe event" });
  }
  try {
    await handleStripeBookingEvent({ ...event, account: parsed.data.stripe_user_id });
    return res.status(200).json({ received: true });
  } catch (error) {
    return res
      .status(error instanceof HttpError ? error.statusCode : 500)
      .json({ message: "Stripe event not processed" });
  }
}
