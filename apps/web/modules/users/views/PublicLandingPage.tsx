"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { LandingPage } from "@calcom/prisma/landingPage";
import type { ReactNode } from "react";
import { LandingSocialIcon } from "./LandingSocialIcon";
import styles from "./public-landing.module.css";

export function PublicLandingPage({
  page,
  name,
  avatarUrl,
  bio,
  bookingAction,
  preview = false,
}: {
  page: LandingPage;
  name: string;
  avatarUrl?: string | null;
  bio: ReactNode;
  bookingAction: (label: string) => ReactNode;
  preview?: boolean;
}) {
  const { t } = useLocale();
  return (
    <section
      className={styles.landing}
      data-layout={preview && page.layout === "cover" ? "portrait" : page.layout}
      data-testid="public-landing">
      {page.layout !== "creator" && (
        <div className={styles.visual}>
          {page.coverImage ? (
            <img
              src={page.coverImage}
              alt={page.headline || name}
              className={styles.cover}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={styles.placeholder} aria-hidden="true">
              <span>{name.trim().slice(0, 1).toUpperCase()}</span>
            </div>
          )}
        </div>
      )}
      <div className={styles.content}>
        {avatarUrl && (
          <img className={styles.avatar} src={avatarUrl} alt={name} referrerPolicy="no-referrer" />
        )}
        <p className={styles.eyebrow}>{name}</p>
        <h1>{page.headline || name}</h1>
        <div className={styles.description}>{page.description || bio}</div>
        {page.socialLinks.length > 0 && (
          <nav className={styles.socials} aria-label={t("landing_socials")}>
            {page.socialLinks.map((link) => (
              <a
                key={link.platform}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.platform}>
                <LandingSocialIcon platform={link.platform} />
              </a>
            ))}
          </nav>
        )}
        {page.showBookingButton && <div className={styles.action}>{bookingAction(t("landing_book"))}</div>}
        <div className={styles.sections}>
          {page.sections
            .filter((section) => section.enabled)
            .map((section) => (
              <article
                key={section.id}
                className={section.type === "text" ? styles.textSection : styles.card}>
                <div className={styles.cardHeading}>
                  {section.image && (
                    <img
                      src={section.image}
                      alt=""
                      className={styles.thumbnail}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div>
                    <h2>{section.title}</h2>
                    {section.description && <p>{section.description}</p>}
                  </div>
                </div>
                {section.type !== "text" && section.priceLabel && (
                  <div className={styles.price}>{section.priceLabel}</div>
                )}
                {section.type !== "text" && (
                  <div className={styles.action}>
                    {section.type === "booking" ? (
                      bookingAction(section.buttonLabel || t("landing_book"))
                    ) : (
                      <a href={section.url} target="_blank" rel="noopener noreferrer">
                        {section.buttonLabel || t("landing_section_open")}
                      </a>
                    )}
                  </div>
                )}
              </article>
            ))}
        </div>
        {page.links.length > 0 && (
          <nav className={styles.links} aria-label={t("landing_links")}>
            {page.links.map((link, index) => (
              <a key={`${index}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
                <span aria-hidden="true"> ↗</span>
              </a>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
