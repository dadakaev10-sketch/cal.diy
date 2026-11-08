"use client";
import type { appDataSchema } from "@calcom/app-store/stripepayment/zod";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { RefundPolicy } from "@calcom/lib/payment/types";
import { serviceDisplayPriceCurrencies, serviceDisplayPriceSchema } from "@calcom/prisma/serviceDisplayPrice";
import { Button } from "@calcom/ui/components/button";
import { Label, TextField } from "@calcom/ui/components/form";
import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import type { z } from "zod";

type StripeSettings = z.infer<typeof appDataSchema>;
type Connection = { available: boolean; connected: boolean; credentialId: number | null; testMode: boolean };
export function ServicePaymentSettings() {
  const { t, i18n } = useLocale();
  const { watch, setValue } = useFormContext<FormValues>();
  const apps = watch("metadata.apps");
  const otherPayment = Object.entries(apps ?? {}).some(
    ([key, value]) =>
      key !== "stripe" &&
      value &&
      typeof value === "object" &&
      "enabled" in value &&
      value.enabled === true &&
      "price" in value
  );
  const stripe = watch("metadata.apps.stripe"),
    display = watch("metadata.serviceDisplayPrice");
  const [connection, setConnection] = useState<Connection | null>(null),
    [failed, setFailed] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch("/api/studio/stripe/status", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const value: Connection = await res.json();
        if (!controller.signal.aborted) setConnection(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [reload]);
  const mode = !stripe?.enabled
    ? "studio"
    : stripe.depositMode && stripe.depositMode !== "none"
      ? "deposit"
      : "full";
  const amount = stripe?.enabled ? stripe.price : (display?.amountMinor ?? stripe?.price ?? 0);
  const currency = (
    stripe?.enabled ? stripe.currency : (display?.currency ?? stripe?.currency ?? "EUR")
  ).toLowerCase();
  const kind = stripe?.depositMode === "fixed" ? "fixed" : "percent",
    value = stripe?.depositValue ?? 30;
  const due =
    mode === "studio"
      ? 0
      : mode === "full"
        ? amount
        : kind === "fixed"
          ? value
          : Math.round((amount * value) / 100);
  const valid =
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= 99999999 &&
    Number.isSafeInteger(due) &&
    due > 0 &&
    (mode !== "deposit" || due < amount) &&
    (kind !== "percent" || mode !== "deposit" || (value > 0 && value < 100));
  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: currency.toUpperCase() }).format(
      n / 100
    );
  function update(patch: Partial<StripeSettings>) {
    const next: StripeSettings = { ...stripe, price: amount, currency, ...patch };
    setValue("metadata.apps.stripe", next, { shouldDirty: true, shouldValidate: true });
    const displayPrice = serviceDisplayPriceSchema.safeParse({
      enabled: display?.enabled ?? false,
      amountMinor: next.price,
      currency: next.currency.toUpperCase(),
    });
    if (displayPrice.success)
      setValue("metadata.serviceDisplayPrice", displayPrice.data, { shouldDirty: true });
  }
  function changeMode(next: string) {
    if (next !== "studio" && !connection?.available) return;
    update({
      enabled: next !== "studio",
      price: amount,
      currency,
      credentialId: connection?.credentialId ?? stripe?.credentialId ?? undefined,
      paymentOption: "ON_BOOKING",
      depositMode: next === "deposit" ? kind : "none",
      depositValue: next === "deposit" ? value : undefined,
      refundPolicy: stripe?.refundPolicy ?? RefundPolicy.NEVER,
      autoChargeNoShowFeeIfCancelled: false,
    });
  }
  const selectClass = "border-default bg-default text-default h-10 w-full rounded-md border px-3 text-sm";
  if (otherPayment)
    return (
      <section className="border-subtle rounded-lg border p-6">
        <h3 className="text-default font-semibold">{t("studio_payment_title")}</h3>
        <p className="text-sm">{t("other_payment_app_enabled")}</p>
      </section>
    );
  return (
    <section aria-labelledby="studio-payment-title" className="border-subtle space-y-5 rounded-lg border p-6">
      <div>
        <h3 id="studio-payment-title" className="text-default font-semibold">
          {t("studio_payment_title")}
        </h3>
        <p className="text-subtle text-sm">{t("studio_payment_help")}</p>
      </div>
      {((connection && !connection.available) || failed) && (
        <div className="space-y-3 rounded-md bg-subtle p-4 text-sm">
          <p>{t(failed ? "studio_payment_load_failed" : "studio_payment_connect_first")}</p>
          <div className="flex flex-wrap gap-2">
            <Button color="secondary" href="/settings/my-account/payments">
              {t("studio_payment_connect")}
            </Button>
            {failed && (
              <Button color="secondary" type="button" onClick={() => setReload((x) => x + 1)}>
                {t("refresh")}
              </Button>
            )}
          </div>
        </div>
      )}
      {connection?.testMode && <p className="text-sm">{t("stripe_rak_test_mode")}</p>}
      <div>
        <Label htmlFor="studio-payment-mode">{t("studio_payment_mode")}</Label>
        <select
          id="studio-payment-mode"
          className={selectClass}
          value={mode}
          onChange={(e) => changeMode(e.target.value)}>
          <option value="studio">{t("studio_payment_studio")}</option>
          <option value="full" disabled={!connection?.available}>
            {t("studio_payment_full")}
          </option>
          <option value="deposit" disabled={!connection?.available}>
            {t("studio_payment_deposit")}
          </option>
        </select>
      </div>
      {mode !== "studio" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="studioPaymentTotal"
              label={t("studio_payment_total")}
              type="number"
              inputMode="decimal"
              min="0.01"
              max="999999.99"
              step="0.01"
              value={amount / 100 || ""}
              required
              onChange={(e) => update({ price: Math.round(Number(e.target.value) * 100) })}
            />
            <div>
              <Label htmlFor="studio-payment-currency">{t("currency")}</Label>
              <select
                id="studio-payment-currency"
                className={selectClass}
                value={currency}
                onChange={(e) => update({ currency: e.target.value })}>
                {!serviceDisplayPriceCurrencies.some((c) => c.toLowerCase() === currency) && (
                  <option value={currency}>{currency.toUpperCase()}</option>
                )}
                {serviceDisplayPriceCurrencies.map((c) => (
                  <option key={c} value={c.toLowerCase()}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {mode === "deposit" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="studio-deposit-kind">{t("studio_payment_deposit_kind")}</Label>
                <select
                  id="studio-deposit-kind"
                  className={selectClass}
                  value={kind}
                  onChange={(e) =>
                    update({
                      depositMode: e.target.value === "fixed" ? "fixed" : "percent",
                      depositValue: e.target.value === "fixed" ? Math.round(amount * 0.3) : 30,
                    })
                  }>
                  <option value="percent">{t("studio_payment_percent")}</option>
                  <option value="fixed">{t("studio_payment_fixed")}</option>
                </select>
              </div>
              <TextField
                name="studioPaymentDeposit"
                label={
                  t(kind === "percent" ? "studio_payment_percent" : "studio_payment_fixed") +
                  (kind === "percent" ? " (%)" : ` (${currency.toUpperCase()})`)
                }
                type="number"
                inputMode="decimal"
                min="0.01"
                max={kind === "percent" ? "99.99" : String(Math.max(0, amount - 1) / 100)}
                step="0.01"
                value={kind === "percent" ? value : value / 100}
                required
                onChange={(e) =>
                  update({
                    depositValue:
                      kind === "percent" ? Number(e.target.value) : Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </div>
          )}
          {valid ? (
            <div className="text-sm">
              <p>
                {t("studio_payment_due")}: <strong>{money(due)}</strong>
              </p>
              {mode === "deposit" && (
                <p>
                  {t("studio_payment_balance")}: <strong>{money(amount - due)}</strong>
                </p>
              )}
            </div>
          ) : (
            <p role="alert" className="text-sm text-red-700">
              {t("studio_payment_invalid")}
            </p>
          )}
          {mode === "deposit" && <p className="text-subtle text-sm">{t("studio_payment_balance_help")}</p>}
        </div>
      )}
      <p className="text-subtle text-sm">{t("studio_payment_future")}</p>
    </section>
  );
}
