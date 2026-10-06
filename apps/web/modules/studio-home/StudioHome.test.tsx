import de from "@calcom/i18n/locales/de/common.json";
import en from "@calcom/i18n/locales/en/common.json";
import ru from "@calcom/i18n/locales/ru/common.json";
import { cleanup, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import StudioHome from "./StudioHome";

afterEach(cleanup);
describe("public studio homepage", () => {
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
