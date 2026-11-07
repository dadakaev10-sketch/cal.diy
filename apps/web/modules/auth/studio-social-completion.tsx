"use client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { type FormEvent, useEffect, useState } from "react";
import styles from "./studio-auth.module.css";
import StudioSocialButtons from "./studio-social-buttons";

type State = {
  status?: string;
  email?: string;
  name?: string;
  error?: string;
  providers?: string[];
  sessionFresh?: boolean;
};
export default function StudioSocialCompletion({
  error,
  link,
  linked,
}: {
  error?: string;
  link: boolean;
  linked: boolean;
}) {
  const { t } = useLocale();
  const [state, setState] = useState<State>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (error || linked) return;
    fetch(link ? "/api/studio-auth/methods" : "/api/studio-web-auth/status", { cache: "no-store" })
      .then(async (r) => {
        const s = await r.json();
        if (s.status === "signed_in")
          window.location.replace(r.headers.get("X-Fixmit-Destination") || "/event-types");
        else if (active) setState(s);
      })
      .catch(() => {
        if (active) setState({ error: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [error, link, linked]);
  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const payload = action === "onboard" ? { ...data, acceptedTerms: data.acceptedTerms === "on" } : data;
      const r = await fetch(`/api/studio-web-auth/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const s = await r.json();
      if (s.status === "signed_in") {
        window.location.replace(r.headers.get("X-Fixmit-Destination") || "/event-types");
        return;
      }
      if (!r.ok) throw new Error(s.error);
      setState(s);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setMessage(
        t(
          code === "studio_slug_unavailable"
            ? "studio_slug_unavailable"
            : code === "invalid_second_factor"
              ? "studio_social_factor_invalid"
              : "studio_social_error"
        )
      );
    } finally {
      setBusy(false);
    }
  }
  const login = "/auth/login?reauth=1&callbackUrl=%2Fauth%2Fsocial%3Flink%3D1";
  if (linked)
    return (
      <>
        <h1>{t("studio_social_linked")}</h1>
        <a className={styles.primary} href="/event-types">
          {t("studio_social_continue")}
        </a>
      </>
    );
  if (error || state?.error || state?.status === "account_link_required")
    return (
      <>
        <h1>{t("studio_social_title")}</h1>
        <p role="alert">
          {t(
            error === "account_link_required" || state?.status === "account_link_required"
              ? "studio_social_existing"
              : state?.error === "signin_required"
                ? "studio_social_reauth_required"
                : "studio_social_error"
          )}
        </p>
        <a
          className={styles.primary}
          href={
            error === "account_link_required" || state?.status === "account_link_required"
              ? login
              : "/auth/login"
          }>
          {t("home_login")}
        </a>
      </>
    );
  if (link)
    return (
      <>
        <h1>{t("studio_social_methods")}</h1>
        <p>{t("studio_social_link_intro")}</p>
        {state?.sessionFresh ? (
          <>
            <p>
              {t("studio_social_connected")}: {state.providers?.join(", ") || t("studio_social_none")}
            </p>
            <StudioSocialButtons
              mode="link"
              allowed={["apple", "google"].filter((p) => !state.providers?.includes(p))}
            />
          </>
        ) : (
          <>
            <p>{t("studio_social_reauth_required")}</p>
            <a className={styles.primary} href={login}>
              {t("home_login")}
            </a>
          </>
        )}
        <a className={styles.secondary} href="/settings/my-account/general">
          {t("studio_social_back_settings")}
        </a>
      </>
    );
  if (!state) return <p role="status">{t("studio_social_loading")}</p>;
  return (
    <>
      <h1>{t("studio_social_title")}</h1>
      {state.status === "onboarding_required" && (
        <>
          <p>{t("studio_social_onboard")}</p>
          <p>{state.email}</p>
          <form className={styles.form} onSubmit={(e) => submit(e, "onboard")}>
            <label>
              {t("name")}
              <input
                name="name"
                autoComplete="name"
                defaultValue={state.name}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              {t("studio_name")}
              <input name="studioName" minLength={2} maxLength={100} required />
            </label>
            <label>
              {t("studio_booking_address")}
              <input
                name="slug"
                autoCapitalize="none"
                autoCorrect="off"
                pattern="[a-z0-9][a-z0-9-]{2,48}[a-z0-9]"
                minLength={4}
                maxLength={50}
                required
              />
            </label>
            <label>
              {t("timezone")}
              <input
                name="timeZone"
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Vienna"}
                maxLength={80}
                required
              />
            </label>
            <label className={styles.socialConsent}>
              <input name="acceptedTerms" type="checkbox" required />
              <span>
                {t("studio_social_accept")}{" "}
                <a href="/terms" target="_blank" rel="noreferrer">
                  {t("public_terms_title")}
                </a>
                .{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">
                  {t("public_privacy_title")}
                </a>
              </span>
            </label>
            <button className={styles.primary} disabled={busy}>
              {t(busy ? "studio_social_loading" : "home_register")}
            </button>
          </form>
        </>
      )}
      {state.status === "two_factor_required" && (
        <>
          <p>{t("studio_social_factor")}</p>
          <form className={styles.form} onSubmit={(e) => submit(e, "exchange")}>
            <label>
              {t("studio_social_factor_code")}
              <input name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={32} />
            </label>
            <label>
              {t("studio_social_backup")}
              <input name="backup" autoComplete="off" maxLength={128} />
            </label>
            <button className={styles.primary} disabled={busy}>
              {t("studio_social_continue")}
            </button>
          </form>
        </>
      )}
      {message && <p role="alert">{message}</p>}
      <a
        className={styles.secondary}
        href="/auth/login"
        onClick={() => {
          void fetch("/api/studio-web-auth/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            keepalive: true,
          });
        }}>
        {t("cancel")}
      </a>
    </>
  );
}
