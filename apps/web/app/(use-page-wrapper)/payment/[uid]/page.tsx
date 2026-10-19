import {
  stripeBookingEnabled,
  stripeBookingLiveMode,
} from "@calcom/app-store/stripepayment/lib/bookingConfig";
import { bookingStripeData, verifyBookingIntent } from "@calcom/app-store/stripepayment/lib/bookingPayment";
import { balanceSnapshotSchema, depositSnapshotSchema } from "@calcom/app-store/stripepayment/lib/deposit";
import stripe from "@calcom/app-store/stripepayment/lib/server";
import prisma from "@calcom/prisma";
import type { PageProps } from "app/_types";
import { notFound } from "next/navigation";
import { z } from "zod";
import StripeBookingPayment from "./StripeBookingPayment";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment | Fixmit", robots: { index: false, follow: false } };

export default async function Page({ params }: PageProps) {
  if (!stripeBookingEnabled()) notFound();
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
  const balance = balanceSnapshotSchema.safeParse(payment.data);
  const deposit = depositSnapshotSchema.safeParse(payment.data);
  let parentValid = true;
  if (balance.success) {
    const parent = await prisma.payment.findUnique({
      where: { id: balance.data.depositPaymentId },
      select: { bookingId: true, success: true, refunded: true },
    });
    parentValid = !!parent && parent.bookingId === payment.bookingId && parent.success && !parent.refunded;
  }
  const unavailable =
    !parentValid ||
    payment.refunded ||
    !["ACCEPTED", "PENDING"].includes(payment.booking.status) ||
    (!balance.success && payment.booking.startTime <= new Date());
  let clientSecret: string | null = null;
  let processing = false;
  if (!unavailable && !payment.success) {
    const intent = await stripe.paymentIntents.retrieve(payment.externalId, {
      stripeAccount: parsed.data.stripeAccount,
    });
    verifyBookingIntent(intent, payment, stripeBookingLiveMode());
    processing = ["succeeded", "processing"].includes(intent.status);
    if (intent.status !== "canceled" && !processing) clientSecret = intent.client_secret;
  }
  return (
    <StripeBookingPayment
      total={
        deposit.success ? deposit.data.totalAmount : balance.success ? balance.data.totalAmount : undefined
      }
      remaining={
        deposit.success
          ? deposit.data.totalAmount - deposit.data.depositAmount
          : balance.success
            ? 0
            : undefined
      }
      isBalance={balance.success}
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
