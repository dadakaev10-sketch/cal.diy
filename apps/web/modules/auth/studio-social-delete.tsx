"use client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { type FormEvent, useEffect, useState } from "react";
import styles from "./studio-auth.module.css";
import StudioSocialButtons from "./studio-social-buttons";

type Methods = { providers: string[]; socialReauthFresh: boolean; error?: string };
export function SocialDeleteEntry() {
  const { t } = useLocale();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/studio-auth/methods", { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => {
        if (active) setAvailable(v.providers?.length > 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!available) return null;
  return (
    <a className={styles.dangerButton} href="/auth/social?delete=1">
      {t("studio_social_delete_provider")}
    </a>
  );
}
export default function StudioSocialDelete() {
  const { t } = useLocale();
  const [methods, setMethods] = useState<Methods>();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/studio-auth/methods", { cache: "no-store" })
      .then((r) => r.json())
      .then((value) => {
        if (active) setMethods(value);
      })
      .catch(() => {
        if (active) setError(t("studio_social_error"));
      });
    return () => {
      active = false;
    };
  }, [t]);
  async function remove(event: FormEvent) {
    event.preventDefault();
    if (!ack || !methods?.socialReauthFresh || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/studio-auth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await r.json();
      if (!r.ok || data.status !== "deleted") {
        if (data.error === "reauth_required") setMethods({ ...methods, socialReauthFresh: false });
        throw new Error("unavailable");
      }
      window.location.replace("/auth/login");
    } catch {
      setError(t("studio_social_error"));
      setBusy(false);
    }
  }
  return (
    <>
      <h1 className={styles.dangerText}>{t("studio_social_delete_title")}</h1>
      <p>{t("studio_social_delete_data")}</p>
      <p>{t("studio_social_delete_warning")}</p>
      {!methods && !error && <p role="status">{t("studio_social_loading")}</p>}
      {methods?.error && (
        <>
          <p role="alert">{t("studio_social_reauth_required")}</p>
          <a className={styles.primary} href="/auth/login?callbackUrl=%2Fauth%2Fsocial%3Fdelete%3D1">
            {t("home_login")}
          </a>
        </>
      )}
      {methods && !methods.error && (
        <>
          {methods.socialReauthFresh ? (
            <p role="status">{t("studio_social_identity_confirmed")}</p>
          ) : (
            <>
              <p>{t("studio_social_delete_reauth")}</p>
              <StudioSocialButtons mode="reauth" intent="delete" allowed={methods.providers} />
            </>
          )}
          <form className={styles.form} onSubmit={remove}>
            <label className={styles.socialConsent}>
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                disabled={busy}
                required
              />
              <span>{t("studio_social_delete_ack")}</span>
            </label>
            <button
              type="submit"
              className={styles.dangerButton}
              disabled={!ack || !methods.socialReauthFresh || busy}>
              {t(busy ? "studio_social_deleting" : "studio_social_delete_final")}
            </button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <a className={styles.secondary} href="/settings/my-account/profile">
        {t("cancel")}
      </a>
    </>
  );
}
