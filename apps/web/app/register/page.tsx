import process from "node:process";
import { getTranslation } from "@calcom/i18n/server";
import { redirect } from "next/navigation";
import styles from "../../modules/auth/studio-auth.module.css";
import StudioRegistrationForm from "../../modules/auth/studio-registration-form";
import { studioRegistrationKeys } from "../../modules/auth/studio-registration-labels";

export const dynamic = "force-dynamic";

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
  if (params.recovery === "1") redirect("/recover");
  const enabled = process.env.STUDIO_REGISTRATION_ENABLED === "true";
  const t = await getTranslation(language, "common");
  return (
    <main className={styles.shell} lang={language}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          DADAKAEV <strong>CAL</strong>
        </a>
        <p className={styles.eyebrow}>{t("studio_account_access")}</p>
        <h1>{t("home_register")}</h1>
        <p>{t(enabled ? "studio_registration_intro" : "studio_registration_disabled")}</p>
        {enabled ? (
          <StudioRegistrationForm
            mode="request"
            locale={language}
            labels={Object.fromEntries(studioRegistrationKeys.map((key) => [key, t(key)]))}
          />
        ) : null}
        <a className={enabled ? styles.secondary : styles.primary} href="/auth/login">
          {t("home_login")}
        </a>
        <a className={styles.secondary} href="/">
          {t("studio_back_home")}
        </a>
        <a className={styles.language} href={`/register?lang=${language === "de" ? "en" : "de"}`}>
          {language === "de" ? "English" : "Deutsch"}
        </a>
      </section>
    </main>
  );
}
