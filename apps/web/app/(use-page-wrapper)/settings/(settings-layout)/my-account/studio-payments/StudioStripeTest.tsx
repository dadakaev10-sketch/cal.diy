"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { FormEvent } from "react";
import { useState } from "react";
import { refreshStudioStripeTest, startStudioStripeTest } from "./testActions";

export default function StudioStripeTest({
  teamId,
  checkoutId,
  recent,
  webhookUrl,
}: {
  teamId: number;
  checkoutId: string;
  webhookUrl: string;
  recent: { id: string; status: string; dueNowMinor: number }[];
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await startStudioStripeTest(new FormData(event.currentTarget));
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setMessage(t(result.error ?? "merchant_stripe_test_failed"));
    } catch {
      setMessage(t("merchant_stripe_test_failed"));
    }
    setBusy(false);
  }
  async function refresh(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await refreshStudioStripeTest(teamId, id);
      if (result.status) setStatuses((previous) => ({ ...previous, [id]: result.status ?? "OPEN" }));
      else setMessage(t(result.error ?? "merchant_stripe_test_failed"));
    } catch {
      setMessage(t("merchant_stripe_test_failed"));
    }
    setBusy(false);
  }
  return (
    <div className="border-default space-y-4 border-t pt-4">
      <h3 className="text-emphasis font-semibold">{t("merchant_stripe_test_title")}</h3>
      <p className="text-default text-sm">{t("merchant_stripe_test_description")}</p>
      <form onSubmit={submit} className="space-y-3">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="checkoutId" value={checkoutId} />
        <fieldset disabled={busy} className="space-y-3">
          <label className="text-default block text-sm">
            {t("merchant_stripe_test_total")}
            <input
              className="border-default bg-default ml-2 rounded border p-2"
              type="number"
              name="totalMinor"
              min="50"
              max="100000"
              step="1"
              defaultValue="2000"
              required
            />
          </label>
          <label className="text-default block text-sm">
            {t("merchant_stripe_test_percent")}
            <input
              className="border-default bg-default ml-2 rounded border p-2"
              type="number"
              name="prepaymentPercent"
              min="1"
              max="100"
              step="1"
              defaultValue="50"
              required
            />
          </label>
          <button
            className="bg-inverted text-inverted rounded px-4 py-2 text-sm disabled:opacity-50"
            type="submit">
            {t("merchant_stripe_test_start")}
          </button>
        </fieldset>
      </form>
      {message && (
        <p role="alert" className="text-default text-sm">
          {message}
        </p>
      )}
      <p className="text-subtle text-sm">{t("merchant_stripe_test_refresh_hint")}</p>
      <ul className="space-y-2">
        {recent.map((payment) => (
          <li
            key={payment.id}
            className="text-default flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              €{(payment.dueNowMinor / 100).toFixed(2)} ·{" "}
              {t(`merchant_stripe_test_status_${statuses[payment.id] ?? payment.status}`)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => refresh(payment.id)}
              className="border-default rounded border px-3 py-2">
              {t("merchant_stripe_test_refresh")}
            </button>
          </li>
        ))}
      </ul>
      <details className="text-default text-sm">
        <summary>{t("merchant_stripe_test_webhook")}</summary>
        <p className="my-2">{t("merchant_stripe_test_webhook_help")}</p>
        <code className="block break-all">{webhookUrl}</code>
        <p className="mt-2">checkout.session.completed · checkout.session.expired</p>
      </details>
    </div>
  );
}
