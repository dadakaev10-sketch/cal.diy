"use client";

import { convertFromSmallestToPresentableCurrencyUnit } from "@calcom/lib/currencyConversions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function Form({ paymentUid, canCancel }: { paymentUid: string; canCancel: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useLocale();
  const router = useRouter();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!stripe || !elements || busy) return;
        setBusy(true);
        setError("");
        try {
          const result = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: window.location.origin + window.location.pathname },
          });
          setError(result.error?.message || t("stripe_booking_payment_error"));
        } catch {
          setError(t("stripe_booking_payment_error"));
        } finally {
          setBusy(false);
        }
      }}>
      <PaymentElement />
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!stripe || !elements || busy} loading={busy}>
        {t("stripe_booking_pay")}
      </Button>
      {canCancel && !confirmCancel && (
        <Button type="button" color="minimal" disabled={busy} onClick={() => setConfirmCancel(true)}>
          {t("stripe_booking_cancel")}
        </Button>
      )}
      {confirmCancel && (
        <div className="space-y-3 rounded-lg border p-4">
          <p>{t("stripe_booking_cancel_confirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              color="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const response = await fetch(`/api/payment/${paymentUid}/cancel`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                  });
                  if (!response.ok) throw new Error();
                  router.refresh();
                } catch {
                  setError(t("stripe_booking_cancel_error"));
                  setBusy(false);
                  router.refresh();
                }
              }}>
              {t("stripe_booking_cancel")}
            </Button>
            <Button type="button" color="minimal" disabled={busy} onClick={() => setConfirmCancel(false)}>
              {t("stripe_booking_continue")}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function StripeBookingPayment(props: {
  paymentUid: string;
  cancelled: boolean;
  canCancel: boolean;
  total?: number;
  remaining?: number;
  isBalance?: boolean;
  title: string;
  amount: number;
  currency: string;
  paid: boolean;
  processing: boolean;
  unavailable: boolean;
  bookingUid: string;
  clientSecret: string | null;
  publicKey: string;
  account: string;
}) {
  const { t, i18n } = useLocale();
  const router = useRouter();
  const stripe = useMemo(
    () => loadStripe(props.publicKey, { stripeAccount: props.account }),
    [props.publicKey, props.account]
  );
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (!props.processing || props.paid || polls >= 12) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      router.refresh();
    }, 5000);
    return () => clearTimeout(timer);
  }, [props.processing, props.paid, polls, router]);
  const currency = props.currency.toUpperCase();
  const formatter = new Intl.NumberFormat(i18n.language, { style: "currency", currency });
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16 text-slate-900">
      <section className="mx-auto max-w-lg space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold">Fixmit</p>
        <h1 className="text-2xl font-semibold">{props.title}</h1>
        {!props.cancelled && (
          <>
            {props.total !== undefined && (
              <p>
                {t("booking_payment_total")}:{" "}
                {formatter.format(convertFromSmallestToPresentableCurrencyUnit(props.total, props.currency))}
              </p>
            )}
            {props.total !== undefined && (
              <p className="font-medium">
                {t(props.isBalance ? "booking_payment_balance" : "booking_payment_deposit")}
              </p>
            )}
            <p className="text-xl">
              {formatter.format(convertFromSmallestToPresentableCurrencyUnit(props.amount, props.currency))}
            </p>
            {props.remaining !== undefined && props.remaining > 0 && (
              <p>
                {t("booking_payment_remaining")}:{" "}
                {formatter.format(
                  convertFromSmallestToPresentableCurrencyUnit(props.remaining, props.currency)
                )}
                . {t("booking_payment_balance_help")}
              </p>
            )}
          </>
        )}
        {props.canCancel && !props.cancelled && !props.paid && !props.processing && (
          <p className="text-sm text-slate-600">{t("stripe_booking_expiry_notice")}</p>
        )}
        {props.publicKey.startsWith("pk_test_") && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm">{t("stripe_booking_sandbox")}</p>
        )}
        {props.cancelled ? (
          <>
            <p role="status">{t("stripe_booking_cancelled")}</p>
            <Button href={`/booking/${props.bookingUid}`}>{t("stripe_booking_view")}</Button>
          </>
        ) : props.paid ? (
          <>
            <p role="status">{t("stripe_booking_paid")}</p>
            <Button href={`/booking/${props.bookingUid}`}>{t("stripe_booking_view")}</Button>
          </>
        ) : props.unavailable ? (
          <p role="alert">{t("stripe_booking_unavailable")}</p>
        ) : props.processing ? (
          <p role="status">{t("stripe_booking_processing")}</p>
        ) : props.clientSecret ? (
          <Elements stripe={stripe} options={{ clientSecret: props.clientSecret }}>
            <Form paymentUid={props.paymentUid} canCancel={props.canCancel} />
          </Elements>
        ) : null}
      </section>
    </main>
  );
}
