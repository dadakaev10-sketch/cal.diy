import { z } from "zod";

export const serviceDisplayPriceSchema = z.object({
  enabled: z.boolean(),
  amountMinor: z.number().int().min(0).max(99999999),
  currency: z.enum(["EUR", "USD", "GBP", "CHF", "GEL", "AED", "TRY"]),
});
