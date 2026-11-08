"use client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { useCallback, useEffect, useState } from "react";

type Status = {
  connected: boolean;
  available: boolean;
  connectAvailable: boolean;
  accountLabel: string | null;
  mode: string | null;
  currency: string;
  testMode: boolean;
};
export default function StripePaymentsForm() {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(""),
    [publishableKey, setPublishableKey] = useState(""),
    [confirm, setConfirm] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/stripe/status", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStatus(await res.json());
    } catch {
      setError("stripe_rak_failed");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(action: "connect" | "disconnect") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/stripe/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "connect"
            ? { apiKey: apiKey.trim(), publishableKey: publishableKey.trim() }
            : { confirm: true }
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "stripe_pending_payments" ? "stripe_rak_pending" : "stripe_rak_failed");
        return;
      }
      setApiKey("");
      setPublishableKey("");
      setConfirm(false);
      await load();
    } catch {
      setError("stripe_rak_failed");
    } finally {
      setBusy(false);
      setApiKey("");
    }
  }
  return (
    <section className="border-subtle bg-default rounded-lg border p-6">
      <h1 className="text-emphasis text-xl font-semibold">{t("stripe_rak_management")}</h1>
      <p className="text-subtle my-4 text-sm">{t("stripe_rak_security")}</p>
      {status && (
        <div className="my-4 space-y-2">
          <p>{t(status.connected ? "stripe_rak_connected" : "stripe_rak_not_connected")}</p>
          {status.accountLabel && (
            <p>
              {status.accountLabel} · {status.currency.toUpperCase()}
            </p>
          )}
          {status.connected && <p>{t(status.available ? "stripe_rak_ready" : "stripe_rak_not_ready")}</p>}
          {status.testMode && <p>{t("stripe_rak_test_mode")}</p>}
        </div>
      )}
      {status && !status.connected && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit("connect");
          }}
          className="my-6 max-w-xl space-y-4">
          <p className="whitespace-pre-line text-sm">{t("stripe_rak_instructions")}</p>
          <a
            href="https://dashboard.stripe.com/apikeys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emphasis inline-block text-sm underline">
            {t("stripe_rak_open")}
          </a>
          <details className="text-subtle text-sm">
            <summary className="cursor-pointer">{t("stripe_rak_permissions_title")}</summary>
            <p className="mt-3 whitespace-pre-line">{t("stripe_rak_permissions")}</p>
          </details>
          <label className="block text-sm">
            {t("stripe_rak_restricted_key")}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="border-default bg-default mt-2 w-full rounded-md"
              required
            />
          </label>
          <label className="block text-sm">
            {t("stripe_rak_public_key")}
            <input
              value={publishableKey}
              onChange={(e) => setPublishableKey(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="border-default bg-default mt-2 w-full rounded-md"
              required
            />
          </label>
          <p className="text-subtle text-sm">{t("stripe_rak_same_mode")}</p>
          <Button
            type="submit"
            disabled={
              busy ||
              !status.connectAvailable ||
              !apiKey.startsWith("rk_") ||
              !publishableKey.startsWith("pk_")
            }>
            {t("stripe_rak_save")}
          </Button>
        </form>
      )}
      <div className="flex flex-wrap gap-3">
        <Button color="secondary" disabled={busy} onClick={() => void load()}>
          {t("stripe_rak_check")}
        </Button>
        {status?.mode === "restricted" && (
          <Button color="destructive" disabled={busy} onClick={() => setConfirm(true)}>
            {t("stripe_rak_disconnect")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {t(error)}
        </p>
      )}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader title={t("stripe_rak_disconnect")} />
          <p>{t("stripe_rak_disconnect_warning")}</p>
          <DialogFooter>
            <Button color="secondary" disabled={busy} onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
            <Button color="destructive" disabled={busy} onClick={() => void submit("disconnect")}>
              {t("stripe_rak_disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
