"use client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useEffect, useState } from "react";
import styles from "./studio-auth.module.css";
export default function StudioSocialButtons({
  mode = "login",
  allowed,
  intent,
}: {
  mode?: "login" | "link" | "reauth";
  allowed?: string[];
  intent?: "link" | "delete";
}) {
  const { t } = useLocale();
  const [options, setOptions] = useState<{ apple: boolean; google: boolean }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/studio-web-auth/options", { cache: "no-store" }).then((r) => r.json()),
      mode === "reauth"
        ? fetch("/api/studio-auth/methods", { cache: "no-store" }).then((r) => r.json())
        : Promise.resolve(null),
    ])
      .then(([value, methods]) => {
        if (active)
          setOptions({
            ...value,
            apple: value.apple && (!methods || methods.providers?.includes("apple")),
            google: value.google && (!methods || methods.providers?.includes("google")),
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode]);
  async function start(provider: "apple" | "google") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetch("/api/studio-web-auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, mode, intent }),
      });
      const data = await result.json();
      if (!result.ok || !data.authorizationURL) throw new Error(data.error || "unavailable");
      const url = new URL(data.authorizationURL);
      if (!["https://accounts.google.com", "https://appleid.apple.com"].includes(url.origin))
        throw new Error("unavailable");
      window.location.assign(url.href);
    } catch (e) {
      setError(
        e instanceof Error && ["signin_required", "reauth_required"].includes(e.message)
          ? t("studio_social_reauth_required")
          : t("studio_social_error")
      );
      setBusy(false);
    }
  }
  if (!options?.apple && !options?.google) return null;
  return (
    <div className={styles.socialButtons} aria-busy={busy}>
      {options.apple && (!allowed || allowed.includes("apple")) && (
        <button type="button" disabled={busy} className={styles.appleButton} onClick={() => start("apple")}>
          <img src="/fixmit/apple-logo.svg" alt="" width={20} height={24} />
          <span>{t("studio_social_apple")}</span>
        </button>
      )}
      {options.google && (!allowed || allowed.includes("google")) && (
        <button type="button" disabled={busy} className={styles.googleButton} onClick={() => start("google")}>
          <img src="/google-icon-colored.svg" alt="" width={20} height={20} />
          <span>{t("studio_social_google")}</span>
        </button>
      )}
      {busy && <p role="status">{t("studio_social_loading")}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          {mode !== "login" && (
            <a href="/auth/login?reauth=1&callbackUrl=%2Fauth%2Fsocial%3Flink%3D1">{t("home_login")}</a>
          )}
        </p>
      )}
    </div>
  );
}
