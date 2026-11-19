import type { TFunction } from "i18next";
import styles from "./pro-pricing.module.css";

export function ProPricing({
  t,
  language,
  upcoming,
  link = false,
}: {
  t: TFunction;
  language: string;
  upcoming: boolean;
  link?: boolean;
}) {
  const Heading = link ? "h2" : "h1";
  const PlanHeading = link ? "h3" : "h2";
  return (
    <section
      className={styles.section}
      style={link ? undefined : { width: "100%", marginInline: "auto" }}
      aria-label={t("public_pricing_title")}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>FIXMIT · {t("public_pricing_title")}</p>
        <Heading>{t("pro_public_title")}</Heading>
        <p>{t("pro_public_intro")}</p>
      </header>
      <div className={styles.grid}>
        <article className={styles.card}>
          <PlanHeading>Free</PlanHeading>
          <p className={styles.description}>{t("pro_public_free_description")}</p>
          <p className={styles.price}>
            0 € <span>{t("pro_public_period")}</span>
          </p>
          <ul className={styles.features}>
            <li>{t("pro_public_free_services")}</li>
            <li>{t("pro_public_free_branding")}</li>
          </ul>
          <a className={styles.secondary} href={`/register?lang=${language}`}>
            {t("public_free_start")}
          </a>
        </article>
        <article className={`${styles.card} ${styles.featured}`}>
          <p className={styles.badge}>{t("pro_public_badge")}</p>
          <PlanHeading>Fixmit Pro</PlanHeading>
          <p className={styles.description}>{t("pro_public_description")}</p>
          <p className={styles.price}>
            29 € <span>{t("pro_public_period")}</span>
          </p>
          <ul className={styles.features}>
            <li>{t("pro_public_services")}</li>
            <li>{t("pro_public_deposits")}</li>
            <li>{t("pro_public_branding")}</li>
            <li>{t("pro_public_commission")}</li>
            <li>{t("pro_public_fees")}</li>
            {upcoming && <li>{t("pro_public_trial")}</li>}
          </ul>
          <a
            className={styles.button}
            href={link ? `/pricing?lang=${language}` : "mailto:office@dadakaev.com?subject=Fixmit%20Pro"}>
            {t(link ? "pro_public_pricing_link" : "pro_public_contact")}
          </a>
        </article>
      </div>
      <p className={styles.fees}>{t("pro_public_details")}</p>
      {upcoming && <p className={styles.note}>{t("pro_public_rollout")}</p>}
    </section>
  );
}
