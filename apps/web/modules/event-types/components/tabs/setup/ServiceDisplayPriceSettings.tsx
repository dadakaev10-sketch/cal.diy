import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { serviceDisplayPriceSchema } from "@calcom/prisma/serviceDisplayPrice";
import { Label, Switch, TextField } from "@calcom/ui/components/form";
import { Controller, useFormContext } from "react-hook-form";

export function ServiceDisplayPriceSettings() {
  const { t } = useLocale();
  const { watch, setValue, control, register } = useFormContext<FormValues>();
  const price = watch("metadata.serviceDisplayPrice");

  return (
    <section className="border-subtle rounded-lg border">
      <div className="flex items-center justify-between gap-4 p-6">
        <div>
          <h3 className="text-default font-semibold">{t("service_display_price_title")}</h3>
          <p className="text-subtle text-sm">{t("service_display_price_help")}</p>
        </div>
        <Switch
          aria-label={t("service_display_price_title")}
          checked={price?.enabled ?? false}
          onCheckedChange={(enabled) =>
            setValue(
              "metadata.serviceDisplayPrice",
              {
                enabled,
                amountMinor: Number.isFinite(price?.amountMinor) ? (price?.amountMinor ?? 0) : 0,
                currency: price?.currency ?? "EUR",
              },
              { shouldDirty: true }
            )
          }
        />
      </div>
      {price?.enabled && (
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <Controller
            control={control}
            name="metadata.serviceDisplayPrice.amountMinor"
            render={({ field }) => (
              <TextField
                label={t("service_display_price_amount")}
                type="number"
                inputMode="decimal"
                min="0"
                max="999999.99"
                step="0.01"
                required
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={Number.isFinite(field.value) ? (field.value ?? 0) / 100 : ""}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === "" ? undefined : Math.round(Number(event.target.value) * 100)
                  )
                }
              />
            )}
          />
          <div>
            <Label htmlFor="service-display-currency">{t("currency")}</Label>
            <select
              id="service-display-currency"
              className="border-default bg-default text-default h-9 w-full rounded-md border px-3 text-sm"
              {...register("metadata.serviceDisplayPrice.currency")}>
              {serviceDisplayPriceSchema.shape.currency.options.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
          <p className="text-subtle text-sm sm:col-span-2">{t("service_display_price_payment_note")}</p>
        </div>
      )}
    </section>
  );
}
