import de from "@calcom/i18n/locales/de/common.json";
import en from "@calcom/i18n/locales/en/common.json";
import ru from "@calcom/i18n/locales/ru/common.json";
import { cleanup, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import sitemap from "../../app/sitemap";
import StudioHome from "./StudioHome";
import { homeLanguage, homeMetadata, homeStructuredData, serializeStructuredData } from "./seo";

afterEach(cleanup);
describe("public studio homepage", () => {
  it("normalizes unknown languages and keeps private pages out of the sitemap", () => {
    expect(homeLanguage("fr")).toBe("de");
    expect(homeLanguage(undefined)).toBe("de");
    expect(sitemap()).toHaveLength(3);
    for (const entry of sitemap()) expect(entry.url).toMatch(/^https:\/\/fixmit\.com\/\?lang=(de|en|ru)$/);
  });
  it("escapes script delimiters in translated structured data", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      resources: {
        en: { translation: { ...en, home_seo_description: "</script><script>alert(1)</script>" } },
      },
    });
    const data = homeStructuredData(i18n.t, "en");
    const serialized = serializeStructuredData(data);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized)).toEqual(data);
  });
  it.each([
    "de",
    "en",
    "ru",
  ] as const)("renders %s without missing copy or broken anchors", async (language) => {
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { de: { translation: de }, en: { translation: en }, ru: { translation: ru } },
    });
    const { container } = render(<StudioHome t={i18n.t} language={language} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const metadata = homeMetadata(i18n.t, language);
    const canonical = `https://fixmit.com/?lang=${language}`;
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.alternates?.languages).toEqual({
      de: "https://fixmit.com/?lang=de",
      en: "https://fixmit.com/?lang=en",
      ru: "https://fixmit.com/?lang=ru",
      "x-default": "https://fixmit.com",
    });
    expect(metadata.title).toEqual({ absolute: i18n.t("home_seo_title") });
    const data = homeStructuredData(i18n.t, language);
    const faq = data["@graph"].find((item) => item["@type"] === "FAQPage");
    expect(faq?.inLanguage).toBe(language);
    expect(faq?.mainEntity).toHaveLength(5);
    for (const question of faq?.mainEntity ?? []) {
      expect(container.textContent).toContain(question.name);
      expect(container.textContent).toContain(question.acceptedAnswer.text);
    }
    expect(JSON.parse(serializeStructuredData(data))).toEqual(data);
    expect(sitemap().map((entry) => entry.url)).toContain(canonical);
    expect(container.textContent).not.toContain("home_");
    for (const link of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
      const href = link.getAttribute("href");
      expect(href).toBeTruthy();
      if (href) expect(container.querySelector(href)).not.toBeNull();
    }
    expect(container.querySelector('a[href="/auth/login"]')).not.toBeNull();
    expect(container.querySelector(`a[href="/register?lang=${language}"]`)).not.toBeNull();
    expect(container.querySelector('a[href="/signup"]')).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    for (const code of ["de", "en", "ru"]) {
      const link = container.querySelector(`a[href="/?lang=${code}"]`);
      expect(link).not.toBeNull();
      expect(link?.getAttribute("aria-current")).toBe(code === language ? "page" : null);
    }
    expect(screen.getByText(i18n.t("home_demo_label"))).toBeTruthy();
    expect(screen.getByText(i18n.t("home_early"))).toBeTruthy();
  });
  it("keeps the homepage visible with a dashboard link for signed-in users", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { translation: en }, ru: { translation: ru } } });
    render(<StudioHome t={i18n.t} language="en" signedIn />);
    expect(screen.getByRole("link", { name: en.studio_open_dashboard }).getAttribute("href")).toBe(
      "/event-types"
    );
  });
});
