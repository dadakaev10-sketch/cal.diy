import process from "node:process";
import { getTranslation } from "@calcom/i18n/server";
import styles from "./public-info.module.css";
export const INFO_PAGES = ["pricing", "terms", "privacy", "refund", "imprint"] as const;
type InfoPage = (typeof INFO_PAGES)[number];
const sectionCounts = { pricing: 4, terms: 7, privacy: 8, refund: 4, imprint: 3 };
export async function PublicInfo({
  page,
  searchParams,
}: {
  page: InfoPage;
  searchParams: Promise<{ lang?: string }>;
}) {
  const language = (await searchParams).lang === "en" ? "en" : "de";
  const t = await getTranslation(language, "common");
  const isTest = process.env.PAYPAL_USE_TEST_PLAN === "true";
  return (
    <div className={styles.shell} lang={language}>
      <header className={styles.header}>
        <a href="/" aria-label="Fixmit">
          <img src="/api/logo?brand=fixmit" alt="Fixmit" width={180} height={60} />
        </a>
        <nav>
          <a href={`/${page}?lang=de`} lang="de">
            DE
          </a>
          <a href={`/${page}?lang=en`} lang="en">
            EN
          </a>
          <a href="/auth/login">{t("home_login")}</a>
        </nav>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>FIXMIT</p>
        <h1>{t(`public_${page}_title`)}</h1>
        {page === "pricing" ? (
          <>
            <div className={styles.offer}>
              <h2>{t("fixmit_pass_price")}</h2>
              <p>{t("fixmit_pass_terms")}</p>
              <a className={styles.button} href={`/register?lang=${language}`}>
                {t("public_pass_buy")} ↗
              </a>
            </div>
            <div className={styles.offer} style={{ marginTop: 24 }}>
              <p>{t("fixmit_subscription_option")}</p>
              <h2>{t(isTest ? "public_test_price" : "public_regular_price")}</h2>
              <p>{t(isTest ? "public_no_trial" : "public_trial")}</p>
              <a className={styles.button} href={`/register?lang=${language}`}>
                {t("public_subscribe")} ↗
              </a>
            </div>
          </>
        ) : (
          <p className={styles.updated}>{t("public_updated")}</p>
        )}
        {Array.from({ length: sectionCounts[page] }, (_, n) => (
          <section key={n}>
            <h2>{t(`public_${page}_${n}_heading`)}</h2>
            <p>{t(`public_${page}_${n}_text`)}</p>
          </section>
        ))}
        <p>
          <a href="mailto:office@dadakaev.com">office@dadakaev.com</a>
        </p>
        {page === "refund" && (
          <p>
            <a href="https://paddle.net">Paddle Support</a> ·{" "}
            <a href="https://www.paddle.com/legal/refund-policy">Paddle Refund Policy</a>
          </p>
        )}
        {page === "privacy" && (
          <p>
            <a href="https://www.paypal.com/privacy">PayPal Privacy</a> ·{" "}
            <a href="https://www.paddle.com/legal/privacy">Paddle Privacy</a>
          </p>
        )}
      </main>
      <footer className={styles.footer}>
        <strong>Fixmit · Individual Entrepreneur AKHMED DADAKAEV</strong>
        <nav>
          {INFO_PAGES.map((slug) => (
            <a key={slug} href={`/${slug}?lang=${language}`}>
              {t(`public_${slug}_title`)}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
