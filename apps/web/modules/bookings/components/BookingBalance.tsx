"use client";
import { convertFromSmallestToPresentableCurrencyUnit } from "@calcom/lib/currencyConversions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { useEffect, useState } from "react";

type Balance = {
  total: number;
  paid: number;
  remaining: number;
  currency: string;
  actionable: boolean;
  link: string | null;
  studio: boolean;
};
export default function BookingBalance({ uid }: { uid: string }) {
  const { t, i18n } = useLocale();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const endpoint = `/api/bookings/${encodeURIComponent(uid)}/balance`;
  useEffect(() => {
    const controller = new AbortController();
    setBalance(null);
    setError(false);
    setConfirm(false);
    fetch(endpoint, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setBalance(await res.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [endpoint]);
  async function update(action?: "link" | "studio") {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(
        endpoint,
        action
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            }
          : undefined
      );
      if (!res.ok) throw new Error();
      setBalance(await res.json());
      setConfirm(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!balance && !error) return null;
  const money = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: balance?.currency.toUpperCase() || "EUR",
    }).format(convertFromSmallestToPresentableCurrencyUnit(value, balance?.currency || "eur"));
  return (
    <section className="border-subtle space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{t("booking_payment_summary")}</h3>
      {balance && (
        <>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>{t("booking_payment_total")}</dt>
              <dd>{money(balance.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("booking_payment_paid")}</dt>
              <dd>{money(balance.paid)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>{t("booking_payment_remaining")}</dt>
              <dd>{money(balance.remaining)}</dd>
            </div>
          </dl>
          {balance.studio && <p className="text-sm">{t("booking_payment_studio_done")}</p>}
          {balance.actionable && (
            <div className="flex flex-wrap gap-2">
              <Button color="secondary" disabled={busy} onClick={() => update("link")}>
                {t("booking_payment_link")}
              </Button>
              <Button color="secondary" disabled={busy} onClick={() => setConfirm(true)}>
                {t("booking_payment_studio")}
              </Button>
            </div>
          )}
          {balance.link && (
            <label className="block text-sm">
              {t("booking_payment_share")}
              <input
                className="border-default mt-1 w-full rounded border p-2"
                readOnly
                value={typeof window === "undefined" ? balance.link : window.location.origin + balance.link}
                onFocus={(event) => event.target.select()}
              />
            </label>
          )}
          {confirm && (
            <div className="space-y-2 rounded border p-3">
              <p>{t("booking_payment_studio_confirm", { amount: money(balance.remaining) })}</p>
              <Button disabled={busy} onClick={() => update("studio")}>
                {t("booking_payment_confirm")}
              </Button>
              <Button color="minimal" disabled={busy} onClick={() => setConfirm(false)}>
                {t("cancel")}
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {t("booking_payment_update_error")}
        </p>
      )}
      <Button color="minimal" disabled={busy} onClick={() => update()}>
        {t("customer_refresh")}
      </Button>
    </section>
  );
}
