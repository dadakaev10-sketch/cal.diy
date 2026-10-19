import process from "node:process";
import { handlePaymentSuccess } from "@calcom/app-store/_utils/payments/handlePaymentSuccess";
import { HttpError } from "@calcom/lib/http-error";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import prisma from "@calcom/prisma";
import type Stripe from "stripe";
import { bookingStripeData, verifyBookingIntent } from "./bookingPayment";
import { balanceSnapshotSchema, depositSnapshotSchema } from "./deposit";
import stripe from "./server";

export async function handleStripeBookingEvent(event: Stripe.Event) {
  if (event.type !== "payment_intent.succeeded") return;
  const account = event.account || process.env.FIXMIT_STRIPE_DIRECT_ACCOUNT_ID;
  const object = event.data.object;
  if (!("id" in object) || typeof object.id !== "string" || !account) {
    throw new HttpError({ statusCode: 400, message: "Connected account required" });
  }
  const externalId = object.id;
  const payment = await prisma.payment.findUnique({
    where: { externalId },
    select: {
      id: true,
      appId: true,
      data: true,
      bookingId: true,
      externalId: true,
      amount: true,
      currency: true,
      paymentOption: true,
    },
  });
  // Ignore unrelated payments made by the same studio outside this booking platform.
  if (!payment) {
    if (
      "metadata" in object &&
      object.metadata &&
      typeof object.metadata === "object" &&
      "fixmit_booking_payment" in object.metadata &&
      object.metadata.fixmit_booking_payment === "true"
    ) {
      throw new HttpError({ statusCode: 503, message: "Booking payment not persisted yet" });
    }
    return;
  }
  const data = bookingStripeData.parse(payment.data);
  if (
    payment.appId !== "stripe" ||
    data.stripeAccount !== account ||
    payment.paymentOption !== "ON_BOOKING"
  ) {
    throw new HttpError({ statusCode: 400, message: "Payment account mismatch" });
  }
  const intent = await stripe.paymentIntents.retrieve(externalId, { stripeAccount: account });
  verifyBookingIntent(intent, payment, event.livemode);
  if (intent.status !== "succeeded" || intent.amount_received !== payment.amount) {
    throw new HttpError({ statusCode: 400, message: "Payment not completed" });
  }
  const balance = balanceSnapshotSchema.safeParse(payment.data);
  if (balance.success) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73125, ${payment.bookingId})`;
      const parent = await tx.payment.findUnique({
        where: { id: balance.data.depositPaymentId },
        select: { bookingId: true, amount: true, currency: true, data: true, success: true, refunded: true },
      });
      const snapshot = depositSnapshotSchema.safeParse(parent?.data);
      const parentAccount = bookingStripeData.safeParse(parent?.data);
      if (
        !parent ||
        !snapshot.success ||
        !parentAccount.success ||
        parent.bookingId !== payment.bookingId ||
        parentAccount.data.stripeAccount !== account ||
        parent.currency !== payment.currency ||
        snapshot.data.totalAmount !== balance.data.totalAmount ||
        snapshot.data.depositAmount !== parent.amount ||
        payment.amount !== snapshot.data.totalAmount - parent.amount
      ) {
        throw new HttpError({ statusCode: 400, message: "Invalid booking balance" });
      }
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: { success: true, refunded: true },
      });
      if (current.success || current.refunded) return;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          success: true,
          data: {
            ...data,
            ...balance.data,
            method: "online",
            settledAt: new Date().toISOString(),
            reviewRequired: !parent.success || parent.refunded,
          },
        },
        select: { id: true },
      });
    });
    return;
  }
  // Serialize different Stripe event IDs for the same payment without holding booking row locks.
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73124, ${payment.id})`;
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          success: true,
          refunded: true,
          data: true,
          booking: { select: { status: true, startTime: true } },
        },
      });
      if (current.refunded) return;
      const storedData =
        current.data && typeof current.data === "object" && !Array.isArray(current.data) ? current.data : {};
      if (current.success) {
        if (storedData.bookingFulfillmentComplete === true) return;
        throw new HttpError({ statusCode: 409, message: "Paid booking requires fulfillment review" });
      }
      if (
        !current.booking ||
        !["PENDING", "ACCEPTED"].includes(current.booking.status) ||
        current.booking.startTime <= new Date()
      ) {
        throw new HttpError({ statusCode: 409, message: "Booking requires manual payment review" });
      }
      try {
        await handlePaymentSuccess({
          paymentId: payment.id,
          bookingId: payment.bookingId,
          appSlug: "stripe",
          traceContext: distributedTracing.createTrace("stripe_booking_webhook", {
            meta: { paymentId: payment.id },
          }),
        });
      } catch (error) {
        // The shared payment handler signals completion with an HTTP 200 exception.
        if (!(error instanceof HttpError && error.statusCode === 200)) throw error;
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { data: { ...storedData, bookingFulfillmentComplete: true } },
        select: { id: true },
      });
    },
    { timeout: 90000, maxWait: 5000 }
  );
}
