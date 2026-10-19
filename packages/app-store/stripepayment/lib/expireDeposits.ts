import prisma from "@calcom/prisma";
import { cancelUnpaidBooking, DEPOSIT_TIMEOUT_MS } from "./cancelUnpaidBooking";

export async function expireDeposits(afterId = 0) {
  const payments = await prisma.payment.findMany({
    where: {
      id: { gt: afterId },
      appId: "stripe",
      success: false,
      refunded: false,
      paymentOption: "ON_BOOKING",
      data: { path: ["kind"], equals: "deposit" },
      booking: {
        is: { status: "PENDING", paid: false, createdAt: { lte: new Date(Date.now() - DEPOSIT_TIMEOUT_MS) } },
      },
    },
    select: { id: true, uid: true },
    orderBy: { id: "asc" },
    take: 25,
  });
  let cancelled = 0;
  let skipped = 0;
  let errors = 0;
  for (const payment of payments) {
    try {
      if ((await cancelUnpaidBooking(payment.uid, true)).cancelled) cancelled++;
      else skipped++;
    } catch {
      // Retry on the next scan; provider failures must never release an unpaid slot blindly.
      errors++;
    }
  }
  return {
    checked: payments.length,
    cancelled,
    skipped,
    errors,
    nextCursor: payments.length === 25 ? payments[24].id : 0,
  };
}
