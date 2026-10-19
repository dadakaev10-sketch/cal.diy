import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";

export const depositSettingsSchema = z.object({
  depositMode: z.enum(["none", "percent", "fixed"]).optional(),
  depositValue: z.number().finite().positive().optional(),
});
export const depositSnapshotSchema = z
  .object({
    kind: z.literal("deposit"),
    totalAmount: z.number().int().positive(),
    depositAmount: z.number().int().positive(),
  })
  .refine((value) => value.depositAmount < value.totalAmount);
export const balanceSnapshotSchema = z.object({
  kind: z.literal("balance"),
  depositPaymentId: z.number().int().positive(),
  totalAmount: z.number().int().positive(),
});

export function depositFromMetadata(metadata: unknown) {
  return z
    .object({ apps: z.object({ stripe: depositSettingsSchema.optional() }).optional() })
    .parse(metadata ?? {}).apps?.stripe;
}

export function calculateDeposit(total: number, settings: z.infer<typeof depositSettingsSchema> | undefined) {
  if (!settings?.depositMode || settings.depositMode === "none") return total;
  const value = settings.depositValue;
  if (!Number.isSafeInteger(total) || total <= 0 || !value || !Number.isFinite(value)) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "Invalid deposit amount");
  }
  if (settings.depositMode === "percent" && value >= 100) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "Deposit percentage must be below 100");
  }
  const deposit = settings.depositMode === "percent" ? Math.round((total * value) / 100) : value;
  if (!Number.isSafeInteger(deposit) || deposit <= 0 || deposit >= total) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "Deposit must be less than the total price");
  }
  return deposit;
}
