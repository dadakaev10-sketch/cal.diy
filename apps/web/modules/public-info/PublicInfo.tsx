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
  const isFree = process.env.FIXMIT_BILLING_ENABLED !== "true";
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
        {page === "pricing" && isFree ? (
          <div className={styles.offer}>
            <h2>{t("public_free_name")}</h2>
            <div className={styles.price}>
              <strong>{t("public_free_price")}</strong>
            </div>
            <p className={styles.period}>{t("public_free_period")}</p>
            <p>{t("public_free_terms")}</p>
            <a className={styles.button} href={`/register?lang=${language}`}>
              {t("public_free_start")} ↗
            </a>
          </div>
        ) : page === "pricing" ? (
          <div className={styles.offers}>
            <div className={styles.offer}>
              <h2>{t("public_pass_name")}</h2>
              <div className={styles.price}>
                <strong>{t("public_amount_test")}</strong>
                <span>USD</span>
              </div>
              <p className={styles.period}>{t("public_pass_period")}</p>
              <p>{t("fixmit_pass_terms")}</p>
              <a className={styles.button} href={`/register?lang=${language}`}>
                {t("public_pass_buy")} ↗
              </a>
            </div>
            <div className={styles.offer}>
              <h2>{t("fixmit_subscription_option")}</h2>
              <div className={styles.price}>
                <strong>{t(isTest ? "public_amount_test" : "public_amount_regular")}</strong>
                <span>USD</span>
              </div>
              <p className={styles.period}>{t("public_subscription_period")}</p>
              <p>{t(isTest ? "public_no_trial" : "public_trial")}</p>
              <a className={styles.button} href={`/register?lang=${language}`}>
                {t("public_subscribe")} ↗
              </a>
            </div>
          </div>
        ) : (
          <p className={styles.updated}>{t("public_updated")}</p>
        )}
        {Array.from({ length: sectionCounts[page] }, (_, n) => (
          <section key={n}>
            <h2>{t(`public_${page === "pricing" && isFree ? "free" : page}_${n}_heading`)}</h2>
            <p>
              {t(
                page === "terms" && isFree && n === 2
                  ? "public_free_contract"
                  : `public_${page === "pricing" && isFree ? "free" : page}_${n}_text`
              )}
            </p>
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
