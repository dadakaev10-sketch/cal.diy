"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type Button = { render(element: HTMLElement): Promise<void>; close(): Promise<void>; isEligible(): boolean };
type PayPalWindow = Window & {
  fixmitOneTimePaypal?: {
    Buttons(options: {
      style: { layout: string; label: string };
      createOrder: () => Promise<string>;
      onApprove: (data: { orderID: string }) => Promise<void>;
      onError: () => void;
      onCancel: () => void;
    }): Button;
  };
};
export default function OneTimeCheckout({
  clientId,
  labels,
}: {
  clientId: string;
  labels: Record<string, string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const confirm = useCallback(
    async (orderId?: string) => {
      setChecking(true);
      try {
        for (let i = 0; i < 6; i++) {
          const res = await fetch("/api/fixmit-billing/pass-confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          });
          if (!res.ok) throw new Error("payment");
          const data: { active: boolean } = await res.json();
          if (data.active) {
            window.location.assign("/event-types");
            return;
          }
          setMessage(labels.fixmit_billing_pending);
          if (i < 5) await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch {
        setMessage(labels.fixmit_billing_error);
      } finally {
        setChecking(false);
      }
    },
    [labels]
  );
  useEffect(() => {
    if (!ready || !container.current) return;
    const paypal = (window as PayPalWindow).fixmitOneTimePaypal;
    if (!paypal) return;
    const buttons = paypal.Buttons({
      style: { layout: "vertical", label: "pay" },
      createOrder: async () => {
        const res = await fetch("/api/fixmit-billing/pass-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) throw new Error("payment");
        const data: { id: string } = await res.json();
        return data.id;
      },
      onApprove: ({ orderID }) => confirm(orderID),
      onError: () => setMessage(labels.fixmit_billing_error),
      onCancel: () => setMessage(labels.fixmit_pass_cancelled),
    });
    if (buttons.isEligible())
      buttons.render(container.current).catch(() => setMessage(labels.fixmit_billing_error));
    else setMessage(labels.fixmit_billing_error);
    return () => {
      void buttons.close().catch(() => undefined);
    };
  }, [ready, confirm, labels]);
  return (
    <>
      <Script
        src={`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=capture&currency=USD&components=buttons&enable-funding=card&commit=true`}
        data-namespace="fixmitOneTimePaypal"
        onReady={() => setReady(true)}
        onError={() => setMessage(labels.fixmit_billing_error)}
      />
      <p>{labels.fixmit_pass_card_notice}</p>
      <div ref={container} />
      <p role="status">{message}</p>
      <button type="button" disabled={checking} onClick={() => confirm()}>
        {labels.fixmit_billing_check}
      </button>
    </>
  );
}
