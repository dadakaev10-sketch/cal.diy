"use client";

import { type FormEvent, useEffect, useState } from "react";
import styles from "./studio-auth.module.css";

export default function StudioRegistrationForm({
  mode,
  locale,
  token,
  studioName,
  labels,
}: {
  mode: "request" | "complete" | "admin";
  locale: "de" | "en";
  token?: string;
  studioName?: string | null;
  labels: Record<string, string>;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === "complete" && data.password !== data.passwordConfirmation) {
      setMessage(labels.studio_password_mismatch);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let csrfToken: string | undefined;
      if (mode === "complete") {
        const csrf = await fetch("/api/csrf", { cache: "no-store" });
        if (!csrf.ok) throw new Error("CSRF unavailable");
        csrfToken = (await csrf.json()).csrfToken;
      }
      const result = await fetch(`/api/studio-registration/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locale, token, csrfToken }),
      });
      const body = await result.json();
      setMessage(labels[body.message] || labels.unexpected_error_try_again);
      setDone(result.ok);
    } catch {
      setMessage(labels.unexpected_error_try_again);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div role="status">
        <p>{message}</p>
        {mode === "complete" ? (
          <>
            <p>{labels.studio_choose_availability}</p>
            <a className={styles.primary} href="/auth/login">
              {labels.home_login}
            </a>
          </>
        ) : null}
      </div>
    );
  return (
    <form className={styles.form} method="post" onSubmit={submit}>
      {mode !== "complete" ? (
        <label>
          {labels.email_address}
          <input name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
      ) : null}
      {mode !== "request" ? (
        <label>
          {labels.studio_name}
          <input
            name="studioName"
            defaultValue={studioName || ""}
            readOnly={!!studioName}
            minLength={2}
            maxLength={100}
            required
          />
        </label>
      ) : null}
      {mode === "complete" ? (
        <>
          <label>
            {labels.name}
            <input name="name" autoComplete="name" minLength={2} maxLength={80} required />
          </label>
          <label>
            {labels.studio_booking_address}
            <input
              name="slug"
              autoCapitalize="none"
              autoCorrect="off"
              pattern="[a-z0-9][a-z0-9-]{2,48}[a-z0-9]"
              minLength={4}
              maxLength={50}
              placeholder="mein-studio"
              required
            />
          </label>
          <label>
            {labels.timezone}
            <input
              name="timeZone"
              defaultValue="Europe/Vienna"
              list="studio-timezones"
              maxLength={80}
              required
            />
          </label>
          <datalist id="studio-timezones">
            <option value="Europe/Vienna" />
            <option value="Europe/Berlin" />
            <option value="Europe/Zurich" />
            <option value="Asia/Tbilisi" />
          </datalist>
          <label>
            {labels.password}
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={72}
              aria-describedby="password-requirements"
              required
            />
          </label>
          <p id="password-requirements">{labels.studio_password_requirements}</p>
          <label>
            {labels.studio_confirm_password}
            <input
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={72}
              required
            />
          </label>
        </>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      <button className={styles.primary} type="submit" disabled={busy || !ready} aria-busy={busy}>
        {
          labels[
            mode === "request"
              ? "studio_register_continue"
              : mode === "admin"
                ? "studio_invite_owner"
                : "studio_create_account"
          ]
        }
      </button>
    </form>
  );
}
