import { randomUUID } from "node:crypto";
import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { assertStripeBookingAccount, stripeBookingLiveMode } from "./bookingConfig";
import { bookingStripeData, verifyBookingIntent } from "./bookingPayment";
import { balanceSnapshotSchema, depositSnapshotSchema } from "./deposit";
import stripe from "./server";

export async function bookingBalance(uid: string, userId: number, action?: "link" | "studio") {
  return prisma.$transaction(
    async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { uid, userId },
        select: { id: true, status: true },
      });
      if (!booking) throw new ErrorWithCode(ErrorCode.NotFound);
      // A booking lock serializes link creation, manual settlement, and balance webhooks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73125, ${booking.id})`;
      const payments = await tx.payment.findMany({
        where: { bookingId: booking.id, appId: "stripe" },
        select: {
          id: true,
          uid: true,
          data: true,
          externalId: true,
          amount: true,
          currency: true,
          success: true,
          refunded: true,
        },
        orderBy: { id: "asc" },
      });
      const deposit = payments.find((p) => depositSnapshotSchema.safeParse(p.data).success);
      if (!deposit) return null;
      const snapshot = depositSnapshotSchema.parse(deposit.data);
      if (snapshot.depositAmount !== deposit.amount)
        throw new ErrorWithCode(ErrorCode.BadRequest, "Invalid deposit snapshot");
      const credentials = bookingStripeData.parse(deposit.data);
      let balance = payments.find((p) => {
        const parsed = balanceSnapshotSchema.safeParse(p.data);
        return parsed.success && parsed.data.depositPaymentId === deposit.id;
      });
      const active = booking.status === "ACCEPTED" && deposit.success && !deposit.refunded;
      const balanceAmount = snapshot.totalAmount - deposit.amount;
      if (action && (!active || balance?.refunded))
        throw new ErrorWithCode(ErrorCode.BadRequest, "Payment unavailable");
      if (action) assertStripeBookingAccount(credentials.stripeAccount, userId);
      if (action && !balance?.success) {
        if (!balance) {
          balance = await tx.payment.create({
            data: {
              uid: randomUUID(),
              externalId: `balance_pending_${deposit.uid}`,
              bookingId: booking.id,
              appId: "stripe",
              amount: balanceAmount,
              currency: deposit.currency,
              fee: 0,
              success: false,
              refunded: false,
              paymentOption: "ON_BOOKING",
              data: {
                ...credentials,
                kind: "balance",
                depositPaymentId: deposit.id,
                totalAmount: snapshot.totalAmount,
              },
            },
            select: {
              id: true,
              uid: true,
              data: true,
              externalId: true,
              amount: true,
              currency: true,
              success: true,
              refunded: true,
            },
          });
        }
        const data = {
          ...credentials,
          kind: "balance",
          depositPaymentId: deposit.id,
          totalAmount: snapshot.totalAmount,
        };
        if (action === "studio") {
          if (balance.externalId.startsWith("pi_")) {
            const intent = await stripe.paymentIntents.retrieve(balance.externalId, {
              stripeAccount: credentials.stripeAccount,
            });
            verifyBookingIntent(intent, { ...balance, bookingId: booking.id }, stripeBookingLiveMode());
            if (["succeeded", "processing"].includes(intent.status)) {
              throw new ErrorWithCode(ErrorCode.BadRequest, "Online payment is being processed");
            }
            if (intent.status !== "canceled") {
              await stripe.paymentIntents.cancel(intent.id, {}, { stripeAccount: credentials.stripeAccount });
            }
          }
          balance = await tx.payment.update({
            where: { id: balance.id },
            data: {
              success: true,
              data: { ...data, method: "studio", settledAt: new Date().toISOString(), settledBy: userId },
            },
            select: {
              id: true,
              uid: true,
              data: true,
              externalId: true,
              amount: true,
              currency: true,
              success: true,
              refunded: true,
            },
          });
        } else if (!balance.externalId.startsWith("pi_")) {
          // Persisting the intent ID is atomic with the link; retries reuse the same Stripe intent.
          const intent = await stripe.paymentIntents.create(
            {
              amount: balanceAmount,
              currency: deposit.currency.toLowerCase(),
              payment_method_types: ["card"],
              metadata: {
                fixmit_booking_payment: "true",
                bookingId: String(booking.id),
                paymentKind: "balance",
              },
            },
            { stripeAccount: credentials.stripeAccount, idempotencyKey: `booking-balance-${deposit.uid}` }
          );
          if (intent.status === "canceled")
            throw new ErrorWithCode(ErrorCode.BadRequest, "Payment link expired");
          balance = await tx.payment.update({
            where: { id: balance.id },
            data: { externalId: intent.id },
            select: {
              id: true,
              uid: true,
              data: true,
              externalId: true,
              amount: true,
              currency: true,
              success: true,
              refunded: true,
            },
          });
        }
      }
      const paid =
        (deposit.success && !deposit.refunded ? deposit.amount : 0) +
        (balance?.success && !balance.refunded ? balance.amount : 0);
      return {
        total: snapshot.totalAmount,
        paid,
        remaining: snapshot.totalAmount - paid,
        currency: deposit.currency,
        depositPaid: deposit.success && !deposit.refunded,
        actionable: active && !balance?.success && !balance?.refunded,
        link:
          active && balance?.externalId.startsWith("pi_") && !balance.success && !balance.refunded
            ? `/payment/${balance.uid}`
            : null,
        studio: !!(
          balance?.data &&
          typeof balance.data === "object" &&
          !Array.isArray(balance.data) &&
          balance.data.method === "studio"
        ),
      };
    },
    { timeout: 30000, maxWait: 10000 }
  );
}
