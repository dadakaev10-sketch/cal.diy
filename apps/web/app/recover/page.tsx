import { getTranslation } from "@calcom/i18n/server";
import styles from "../../modules/auth/studio-auth.module.css";
import StudioRecoveryForm from "../../modules/auth/studio-recovery-form";
import { studioRegistrationKeys } from "../../modules/auth/studio-registration-labels";

export const metadata = {
  title: "Passwort zurücksetzen | DADAKAEV CAL",
  robots: { index: false, follow: false },
};
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = (await searchParams).lang === "en" ? "en" : "de";
  const t = await getTranslation(locale, "common");
  return (
    <main className={styles.shell} lang={locale}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          DADAKAEV <strong>CAL</strong>
        </a>
        <h1>{t("forgot_password")}</h1>
        <StudioRecoveryForm
          labels={Object.fromEntries(
            [
              ...studioRegistrationKeys,
              "reset_password",
              "request_password_reset",
              "password_reset_email_sent",
              "password_updated",
            ].map((key) => [key, t(key)])
          )}
        />
        <a className={styles.secondary} href="/auth/login">
          {t("home_login")}
        </a>
        <a className={styles.language} href={`/recover?lang=${locale === "de" ? "en" : "de"}`}>
          {locale === "de" ? "English" : "Deutsch"}
        </a>
      </section>
    </main>
  );
}
