import type { TFunction } from "i18next";
import styles from "./home.module.css";

export default function StudioHome({ t, language }: { t: TFunction; language: "de" | "en" }) {
  return (
    <div className={styles.home} lang={language} id="top">
      <a className={styles.skip} href="#content">
        {t("home_skip")}
      </a>
      <header className={styles.header}>
        <a href="#top" className={styles.brand} aria-label="DADAKAEV CAL">
          <span className={styles.mark} aria-hidden="true">
            c<span>.</span>
          </span>
          <span>
            DADAKAEV <strong>CAL</strong>
          </span>
        </a>
        <nav className={styles.nav} aria-label={t("home_nav_features")}>
          <a href="#features">{t("home_nav_features")}</a>
          <a href="#how">{t("home_nav_how")}</a>
        </nav>
        <div className={styles.headerActions}>
          <a href={language === "de" ? "/?lang=en" : "/?lang=de"} aria-label={t("home_language")}>
            {language === "de" ? "EN" : "DE"}
          </a>
          <a href="/auth/login">{t("home_login")}</a>
          <a className={styles.buttonSmall} href="#registration">
            {t("home_register")} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <main id="content">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.dot} />
              {t("home_eyebrow")}
            </p>
            <h1>
              {t("home_title")}
              <br />
              <em>{t("home_title_accent")}</em>
              <br />
              {t("home_title_end")}
            </h1>
            <p className={styles.lead}>{t("home_description")}</p>
            <div className={styles.actions}>
              <a className={styles.button} href="#registration">
                {t("home_register")} <span aria-hidden="true">↗</span>
              </a>
              <a className={styles.textLink} href="#preview">
                {t("home_demo")} <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className={styles.note}>{t("home_early")}</p>
          </div>
          <figure className={styles.preview} id="preview" aria-label={t("home_preview")}>
            <div className={styles.previewTop}>
              <span className={styles.previewDots} aria-hidden="true">
                ● ● ●
              </span>
              <span>cal.apps.dadakaev.tech / studio-morgen</span>
              <span aria-hidden="true">↗</span>
            </div>
            <div className={styles.booking}>
              <div className={styles.studio}>
                <span className={styles.avatar} aria-hidden="true">
                  m.
                </span>
                <p>{t("home_studio")}</p>
                <h2>{t("home_service")}</h2>
                <p>{t("home_service_detail")}</p>
                <div className={styles.studioTag}>{t("home_hair")}</div>
              </div>
              <div className={styles.calendar}>
                <h3>{t("home_choose")}</h3>
                <div className={styles.month}>
                  {t("home_demo_month")} <span aria-hidden="true">‹　›</span>
                </div>
                <div className={styles.dates} aria-hidden="true">
                  {t("home_weekdays")
                    .split(",")
                    .map((day) => (
                      <small key={day}>{day}</small>
                    ))}
                  <span />
                  {Array.from({ length: 30 }, (_, i) => (
                    <span key={i} className={i === 21 ? styles.selected : undefined}>
                      {i + 1}
                    </span>
                  ))}
                </div>
                <p className={styles.timesLabel}>{t("home_times")}</p>
                <div className={styles.times}>
                  <span>09:00</span>
                  <span className={styles.selected}>10:30</span>
                  <span>14:00</span>
                </div>
              </div>
            </div>
            <div className={styles.selection}>
              <span aria-hidden="true">✓</span> {t("home_demo_selected")}
            </div>
            <figcaption>{t("home_demo_label")}</figcaption>
          </figure>
        </section>
        <section className={styles.industries} aria-label={t("home_nav_studios")}>
          <p className={styles.eyebrow}>{t("home_industries")}</p>
          <div>
            {["beauty", "barber", "hair", "coaching"].map((key) => (
              <span key={key}>{t(`home_${key}`)}</span>
            ))}
          </div>
        </section>
        <section className={styles.section} id="features">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{t("home_nav_features")}</p>
            <h2>{t("home_features_title")}</h2>
            <p>{t("home_features_text")}</p>
          </div>
          <div className={styles.features}>
            {[1, 2, 3].map((n) => (
              <article key={n}>
                <span className={styles.featureNumber}>0{n}</span>
                <h3>{t(`home_feature_${n}`)}</h3>
                <p>{t(`home_feature_${n}_text`)}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.how} id="how">
          <div>
            <p className={styles.eyebrow}>{t("home_nav_how")}</p>
            <h2>{t("home_how_title")}</h2>
            <p className={styles.howAside}>{t("home_focus")}</p>
          </div>
          <ol>
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t(`home_step_${n}`)}</h3>
                  <p>{t(`home_step_${n}_text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.roadmap}>
          <div>
            <p className={styles.eyebrow}>{t("home_roadmap")}</p>
            <h2>{t("home_roadmap_title")}</h2>
            <p>{t("home_roadmap_text")}</p>
          </div>
          <ul>
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <span aria-hidden="true">↗</span>
                {t(`home_roadmap_${n}`)}
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.faq}>
          <h2>{t("home_faq_title")}</h2>
          <div>
            {[1, 2, 3].map((n) => (
              <details key={n}>
                <summary>{t(`home_faq_${n}`)}</summary>
                <p>{t(`home_faq_${n}_text`)}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles.join} id="registration">
          <p className={styles.eyebrow}>{t("home_register")}</p>
          <h2>{t("home_join_title")}</h2>
          <p>{t("home_join_text")}</p>
          <a className={styles.button} href="/auth/login">
            {t("home_login")} <span aria-hidden="true">↗</span>
          </a>
        </section>
      </main>
      <footer className={styles.footer}>
        <div>
          <strong>DADAKAEV CAL</strong>
          <p>{t("home_footer")}</p>
        </div>
        <a href="#top">{t("home_back_top")} ↑</a>
      </footer>
    </div>
  );
}
