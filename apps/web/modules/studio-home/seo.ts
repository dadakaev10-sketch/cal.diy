import type { TFunction } from "i18next";
import type { Metadata } from "next";

export const SITE_URL = "https://fixmit.com";
export const HOME_LANGUAGES = ["de", "en", "ru"] as const;
export type HomeLanguage = (typeof HOME_LANGUAGES)[number];
export const FAQ_ITEMS = [1, 2, 3, 4, 5] as const;
export const homeLanguage = (value: unknown): HomeLanguage =>
  value === "en" || value === "ru" ? value : "de";
export const homeUrl = (language: HomeLanguage) => `${SITE_URL}/?lang=${language}`;

export function homeMetadata(t: TFunction, language: HomeLanguage): Metadata {
  const title = t("home_seo_title");
  const description = t("home_seo_description");
  const image = `${SITE_URL}/fixmit/logo-white-background.png`;
  const locales = { de: "de_DE", en: "en_US", ru: "ru_RU" };
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: homeUrl(language),
      languages: { de: homeUrl("de"), en: homeUrl("en"), ru: homeUrl("ru"), "x-default": SITE_URL },
    },
    openGraph: {
      type: "website",
      siteName: "Fixmit",
      title,
      description,
      url: homeUrl(language),
      locale: locales[language],
      alternateLocale: HOME_LANGUAGES.filter((code) => code !== language).map((code) => locales[code]),
      images: [{ url: image, alt: "Fixmit" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export function homeStructuredData(t: TFunction, language: HomeLanguage) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Fixmit",
        url: SITE_URL,
        logo: `${SITE_URL}/fixmit/logo-white-background.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Fixmit",
        url: SITE_URL,
        inLanguage: HOME_LANGUAGES,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: "Fixmit",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: t("home_seo_description"),
        inLanguage: HOME_LANGUAGES,
        featureList: [1, 2, 3].map((n) => t(`home_feature_${n}_text`)),
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${homeUrl(language)}#faq`,
        url: homeUrl(language),
        inLanguage: language,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: FAQ_ITEMS.map((n) => ({
          "@type": "Question",
          name: t(`home_faq_${n}`),
          acceptedAnswer: { "@type": "Answer", text: t(`home_faq_${n}_text`) },
        })),
      },
    ],
  };
}

// Keep translated text from terminating an inline JSON-LD script.
export const serializeStructuredData = (data: ReturnType<typeof homeStructuredData>) =>
  JSON.stringify(data).replace(/</g, "\\u003c");
