import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { stripeBookingEnabled, stripeBookingLiveMode } from "./bookingConfig";
import { bookingStripeData, verifyBookingIntent } from "./bookingPayment";
import { balanceSnapshotSchema } from "./deposit";
import stripe from "./server";

export async function cancelUnpaidBooking(uid: string) {
  if (!stripeBookingEnabled()) throw new ErrorWithCode(ErrorCode.NotFound);
  const payment = await prisma.payment.findUnique({ where: { uid }, select: { id: true } });
  if (!payment) throw new ErrorWithCode(ErrorCode.NotFound);
  return prisma.$transaction(
    async (tx) => {
      // Share the fulfillment lock so a delayed webhook cannot confirm an abandoned booking.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73124, ${payment.id})`;
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          externalId: true,
          amount: true,
          currency: true,
          bookingId: true,
          appId: true,
          paymentOption: true,
          success: true,
          refunded: true,
          data: true,
          booking: {
            select: {
              uid: true,
              status: true,
              paid: true,
              endTime: true,
              eventType: { select: { disableCancelling: true, seatsPerTimeSlot: true } },
              payment: { select: { id: true, success: true } },
            },
          },
        },
      });
      const booking = current.booking;
      const account = bookingStripeData.safeParse(current.data);
      if (
        !booking ||
        !account.success ||
        current.appId !== "stripe" ||
        current.paymentOption !== "ON_BOOKING" ||
        balanceSnapshotSchema.safeParse(current.data).success ||
        current.success ||
        current.refunded ||
        booking.paid ||
        booking.payment.some((p) => p.success || p.id !== payment.id)
      ) {
        throw new ErrorWithCode(ErrorCode.Forbidden);
      }
      if (booking.status === "CANCELLED") return { cancelled: true };
      if (
        booking.status !== "PENDING" ||
        booking.endTime <= new Date() ||
        booking.eventType?.disableCancelling ||
        booking.eventType?.seatsPerTimeSlot
      ) {
        throw new ErrorWithCode(ErrorCode.BadRequest);
      }
      const options = { stripeAccount: account.data.stripeAccount };
      const intent = await stripe.paymentIntents.retrieve(current.externalId, options);
      verifyBookingIntent(intent, current, stripeBookingLiveMode());
      if (
        intent.amount_received > 0 ||
        !["canceled", "requires_payment_method", "requires_confirmation", "requires_action"].includes(
          intent.status
        )
      ) {
        throw new ErrorWithCode(ErrorCode.BadRequest, "Payment already started");
      }
      if (intent.status !== "canceled") {
        // Stripe cancellation must succeed before releasing the slot, including concurrent payment attempts.
        const cancelled = await stripe.paymentIntents.cancel(
          current.externalId,
          { cancellation_reason: "requested_by_customer" },
          options
        );
        if (cancelled.status !== "canceled") throw new ErrorWithCode(ErrorCode.BadRequest);
      }
      const result = await handleCancelBooking({
        userId: -1,
        bookingData: {
          uid: booking.uid,
          cancellationReason: "Checkout cancelled before payment",
          allRemainingBookings: false,
        },
      });
      if (!result.success) throw new ErrorWithCode(ErrorCode.BadRequest);
      return { cancelled: true };
    },
    { timeout: 90000, maxWait: 5000 }
  );
}
