"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { FormEvent } from "react";
import { useState } from "react";
import { createTestStudio, saveStudioStripe } from "./actions";

export default function StudioStripeForm({
  teamId,
  accountId,
  createStudio = false,
}: {
  teamId?: number;
  accountId?: string;
  createStudio?: boolean;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await (createStudio ? createTestStudio : saveStudioStripe)(new FormData(form));
      setSuccess(result.ok);
      setMessage(result.ok ? "merchant_stripe_saved" : (result.error ?? "merchant_stripe_save_failed"));
      if (result.ok) form.reset();
    } catch {
      setSuccess(false);
      setMessage("merchant_stripe_save_failed");
    } finally {
      setBusy(false);
    }
  }
  const fields = createStudio
    ? [{ name: "name", label: "merchant_stripe_studio_name", placeholder: "Test Studio", secret: false }]
    : [
        { name: "accountId", label: "merchant_stripe_account", placeholder: "acct_…", secret: false },
        {
          name: "publishableKey",
          label: "merchant_stripe_public_key",
          placeholder: "pk_test_…",
          secret: false,
        },
        {
          name: "restrictedKey",
          label: "merchant_stripe_restricted_key",
          placeholder: "rk_test_…",
          secret: true,
        },
        {
          name: "webhookSecret",
          label: "merchant_stripe_webhook_secret",
          placeholder: "whsec_…",
          secret: true,
        },
      ];
  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId ?? ""} />
      <fieldset disabled={busy} className="space-y-4">
        {fields.map((field) => (
          <label key={field.name} className="block text-sm">
            <span className="text-emphasis mb-1 block font-medium">{t(field.label)}</span>
            <input
              className="border-default bg-default text-emphasis w-full rounded-md border p-2"
              name={field.name}
              type={field.secret ? "password" : "text"}
              required={field.name !== "webhookSecret"}
              maxLength={255}
              autoComplete="off"
              spellCheck={false}
              placeholder={field.placeholder}
              defaultValue={field.name === "accountId" ? accountId : undefined}
              readOnly={field.name === "accountId" && !!accountId}
            />
          </label>
        ))}
        <button
          type="submit"
          className="bg-inverted text-inverted rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          {t(
            busy
              ? "merchant_stripe_saving"
              : createStudio
                ? "merchant_stripe_create_studio"
                : "merchant_stripe_save"
          )}
        </button>
      </fieldset>
      {message && (
        <p role={success ? "status" : "alert"} className="text-default text-sm">
          {t(message)}
        </p>
      )}
    </form>
  );
}
