import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";

const quoteSchema = z
  .object({
    totalMinor: z.number().int().min(1).max(99_999_999),
    currency: z.literal("eur"),
    prepaymentPercent: z.number().int().min(0).max(100),
  })
  .strict();

export type MerchantPaymentQuoteInput = z.infer<typeof quoteSchema>;

// The booking service must supply the persisted service price, never a price from the booker's request.
export function createMerchantPaymentQuote(input: MerchantPaymentQuoteInput) {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "Invalid merchant payment terms");
  }
  const { totalMinor, currency, prepaymentPercent } = parsed.data;
  const dueNowMinor = Math.round((totalMinor * prepaymentPercent) / 100);
  if (prepaymentPercent > 0 && dueNowMinor < 50) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "The EUR prepayment must be at least 0.50");
  }
  return { totalMinor, currency, prepaymentPercent, dueNowMinor, remainingMinor: totalMinor - dueNowMinor };
}
