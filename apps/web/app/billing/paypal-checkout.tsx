"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type PayPalWindow = Window & {
  paypal?: {
    Buttons(options: {
      style: { shape: string; color: string; layout: string; label: string };
      createSubscription: () => Promise<string>;
      onApprove: () => Promise<void>;
      onError: () => void;
    }): { render(element: HTMLElement): Promise<void>; close(): Promise<void> };
  };
};
export default function PayPalCheckout({
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
  const confirm = useCallback(async () => {
    setChecking(true);
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await fetch("/api/fixmit-billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) throw new Error("billing");
        const result: { active?: boolean } = await res.json();
        if (result.active) {
          window.location.assign("/event-types");
          return;
        }
        setMessage(labels.fixmit_billing_pending);
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch {
      setMessage(labels.fixmit_billing_error);
    } finally {
      setChecking(false);
    }
  }, [labels]);
  useEffect(() => {
    if (!ready || !container.current) return;
    const paypal = (window as PayPalWindow).paypal;
    if (!paypal) return;
    const buttons = paypal.Buttons({
      style: { shape: "rect", color: "gold", layout: "vertical", label: "subscribe" },
      createSubscription: async () => {
        const res = await fetch("/api/fixmit-billing/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) throw new Error("billing");
        const data: { id: string } = await res.json();
        return data.id;
      },
      onApprove: confirm,
      onError: () => setMessage(labels.fixmit_billing_error),
    });
    buttons.render(container.current).catch(() => setMessage(labels.fixmit_billing_error));
    return () => {
      void buttons.close().catch(() => undefined);
    };
  }, [ready, confirm, labels]);
  return (
    <>
      <Script
        src={`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&currency=USD`}
        onReady={() => setReady(true)}
        onError={() => setMessage(labels.fixmit_billing_error)}
      />
      <div ref={container} />
      <p role="status">{message}</p>
      <button type="button" disabled={checking} onClick={confirm}>
        {labels.fixmit_billing_check}
      </button>
    </>
  );
}
