import { createHash } from "node:crypto";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";
import { appDataSchema } from "../zod";
import { calculateDeposit } from "./deposit";
import { requireStudioStripe } from "./studioConnection";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function paymentSettingsRevision(event: { metadata: unknown; price: number; currency: string }) {
  return createHash("sha256").update(canonical(event)).digest("hex");
}
const metadataInput = z
  .object({ apps: z.object({ stripe: appDataSchema.optional() }).optional() })
  .passthrough();
export async function validateStudioPaymentSettings(metadata: unknown, userId: number) {
  if (metadata == null) return null;
  const parsed = metadataInput.safeParse(metadata);
  if (!parsed.success) throw ErrorWithCode.Factory.BadRequest("stripe_settings_invalid");
  const settings = parsed.data.apps?.stripe;
  if (!settings) return null;
  const currency = settings.currency.toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw ErrorWithCode.Factory.BadRequest("stripe_settings_invalid");
  if (!settings.enabled) return { price: 0, currency };
  if (!Number.isSafeInteger(settings.price) || settings.price <= 0 || settings.price > 99_999_999)
    throw ErrorWithCode.Factory.BadRequest("stripe_settings_invalid");
  const connection = await requireStudioStripe(userId, settings.credentialId);
  if (connection.mode === "restricted" && settings.paymentOption !== "ON_BOOKING")
    throw ErrorWithCode.Factory.BadRequest("stripe_settings_invalid");
  if (settings.paymentOption === "HOLD") {
    if (settings.depositMode && settings.depositMode !== "none")
      throw ErrorWithCode.Factory.BadRequest("stripe_settings_invalid");
  } else calculateDeposit(settings.price, settings);
  return { price: settings.price, currency };
}
