import { getTranslation } from "@calcom/i18n/server";
import styles from "../../modules/auth/studio-auth.module.css";

export const metadata = {
  title: "Studio registration | DADAKAEV CAL",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; recovery?: string }>;
}) {
  const params = await searchParams;
  const language = params.lang === "en" ? "en" : "de";
  const recovery = params.recovery === "1";
  const t = await getTranslation(language, "common");
  return (
    <main className={styles.shell} lang={language}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          DADAKAEV <strong>CAL</strong>
        </a>
        <p className={styles.eyebrow}>{t("studio_account_access")}</p>
        <h1>{t(recovery ? "forgot_password" : "home_register")}</h1>
        <p>{t(recovery ? "studio_recovery_pending" : "studio_registration_pending")}</p>
        <div className={styles.notice}>{t("studio_registration_safety")}</div>
        <a className={styles.primary} href="/auth/login">
          {t("home_login")}
        </a>
        <a className={styles.secondary} href="/">
          {t("studio_back_home")}
        </a>
        <a
          className={styles.language}
          href={`/register?lang=${language === "de" ? "en" : "de"}${recovery ? "&recovery=1" : ""}`}>
          {language === "de" ? "English" : "Deutsch"}
        </a>
      </section>
    </main>
  );
}
