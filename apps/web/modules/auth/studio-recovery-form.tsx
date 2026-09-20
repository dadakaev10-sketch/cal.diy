"use client";

import { type FormEvent, useEffect, useState } from "react";
import styles from "./studio-auth.module.css";

export default function StudioRecoveryForm({
  token,
  labels,
}: {
  token?: string;
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
    if (token && data.password !== data.passwordConfirmation) {
      setMessage(labels.studio_password_mismatch);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let csrfToken: string | undefined;
      if (token) {
        const csrf = await fetch("/api/csrf", { cache: "no-store" });
        if (!csrf.ok) throw new Error("CSRF unavailable");
        csrfToken = (await csrf.json()).csrfToken;
      }
      const response = await fetch(`/api/auth/${token ? "reset-password" : "forgot-password"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, requestId: token, csrfToken }),
      });
      const body = await response.json();
      setMessage(labels[body.message] || labels.unexpected_error_try_again);
      setDone(response.ok);
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
        <a className={styles.primary} href="/auth/login">
          {labels.home_login}
        </a>
      </div>
    );
  return (
    <form className={styles.form} method="post" onSubmit={submit}>
      {token ? (
        <>
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
      ) : (
        <label>
          {labels.email_address}
          <input name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
      )}
      {message ? <p role="alert">{message}</p> : null}
      <button className={styles.primary} type="submit" disabled={busy || !ready} aria-busy={busy}>
        {labels[token ? "reset_password" : "request_password_reset"]}
      </button>
    </form>
  );
}
