import { z } from "zod";

export const serviceDisplayPriceCurrencies = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "GEL",
  "AED",
  "TRY",
] as const;

export const serviceDisplayPriceSchema = z.object({
  enabled: z.boolean(),
  amountMinor: z.number().int().min(0).max(99999999),
  currency: z
    .string()
    .transform((value) => value.toUpperCase())
    .refine((value) => serviceDisplayPriceCurrencies.some((code) => code === value), "Unsupported currency"),
});
