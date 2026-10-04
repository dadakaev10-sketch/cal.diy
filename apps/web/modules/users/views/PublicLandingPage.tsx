"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { LandingPage } from "@calcom/prisma/landingPage";
import type { ReactNode } from "react";
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
  bookingAction: ReactNode;
  preview?: boolean;
}) {
  const { t } = useLocale();
  return (
    <section
      className={styles.landing}
      data-layout={preview ? "portrait" : page.layout}
      data-testid="public-landing">
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
      <div className={styles.content}>
        {avatarUrl && (
          <img className={styles.avatar} src={avatarUrl} alt={name} referrerPolicy="no-referrer" />
        )}
        <p className={styles.eyebrow}>{name}</p>
        <h1>{page.headline || name}</h1>
        <div className={styles.description}>{page.description || bio}</div>
        <div className={styles.action}>{bookingAction}</div>
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
