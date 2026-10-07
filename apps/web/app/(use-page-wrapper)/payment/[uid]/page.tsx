import process from "node:process";
import { bookingStripeData, verifyBookingIntent } from "@calcom/app-store/stripepayment/lib/bookingPayment";
import stripe from "@calcom/app-store/stripepayment/lib/server";
import prisma from "@calcom/prisma";
import type { PageProps } from "app/_types";
import { notFound } from "next/navigation";
import { z } from "zod";
import StripeBookingPayment from "./StripeBookingPayment";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment | Fixmit", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps) {
  if (!process.env.STRIPE_PRIVATE_KEY?.startsWith("sk_test_")) notFound();
  const { uid } = await params;
  if (!z.string().uuid().safeParse(uid).success || typeof uid !== "string") notFound();
  const payment = await prisma.payment.findUnique({
    where: { uid },
    select: {
      externalId: true,
      bookingId: true,
      appId: true,
      amount: true,
      currency: true,
      success: true,
      refunded: true,
      paymentOption: true,
      data: true,
      booking: { select: { uid: true, title: true, startTime: true, status: true, paid: true } },
    },
  });
  if (!payment?.booking || payment.appId !== "stripe" || payment.paymentOption !== "ON_BOOKING") notFound();
  const parsed = bookingStripeData.safeParse(payment.data);
  if (!parsed.success) notFound();
  const unavailable =
    payment.refunded ||
    !["ACCEPTED", "PENDING"].includes(payment.booking.status) ||
    payment.booking.startTime <= new Date();
  let clientSecret: string | null = null;
  let processing = false;
  if (!unavailable && !payment.success) {
    const intent = await stripe.paymentIntents.retrieve(payment.externalId, {
      stripeAccount: parsed.data.stripeAccount,
    });
    verifyBookingIntent(intent, payment, process.env.STRIPE_PRIVATE_KEY?.startsWith("sk_live_") === true);
    processing = ["succeeded", "processing"].includes(intent.status);
    if (intent.status !== "canceled" && !processing) clientSecret = intent.client_secret;
  }
  return (
    <StripeBookingPayment
      title={payment.booking.title}
      amount={payment.amount}
      currency={payment.currency}
      paid={payment.success && payment.booking.paid && !payment.refunded}
      processing={processing}
      unavailable={unavailable || (!payment.success && !processing && !clientSecret)}
      bookingUid={payment.booking.uid}
      clientSecret={clientSecret}
      publicKey={parsed.data.stripe_publishable_key}
      account={parsed.data.stripeAccount}
    />
  );
}
