import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import de from "../../../i18n/locales/de/common.json";
import en from "../../../i18n/locales/en/common.json";
import { ForgotPasswordEmail } from "./ForgotPasswordEmail";
import { VerifyAccountEmail } from "./VerifyAccountEmail";

describe("studio account email templates", () => {
  for (const lng of ["de", "en"]) {
    it(`renders branded ${lng} confirmation and recovery without remote assets`, async () => {
      const i18n = createInstance();
      await i18n.init({
        lng,
        resources: { de: { translation: de }, en: { translation: en } },
        interpolation: { escapeValue: false },
      });
      const link = "https://cal.apps.dadakaev.tech/auth/verify-email?token=example&email=test%40example.test";
      const user = { name: "<img src=x onerror=alert(1)>", email: "test@example.test" };
      for (const component of [
        ForgotPasswordEmail({ language: i18n.t, user, resetLink: link }),
        VerifyAccountEmail({ language: i18n.t, user, verificationEmailLink: link }),
      ]) {
        const html = renderToStaticMarkup(component);
        expect(html).toContain("DADAKAEV CAL");
        expect(html).toContain("#245c49");
        expect(html).toContain('role="presentation"');
        expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
        expect(html).not.toMatch(/<img|<script|fonts.googleapis|cal\.com|cal\.diy/);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const links = [...doc.querySelectorAll("a")];
        expect(links.filter((a) => a.getAttribute("href") === link)).toHaveLength(2);
        expect(doc.querySelectorAll("h1")).toHaveLength(1);
        expect(doc.querySelector("h1")?.textContent).not.toMatch(/change_password|verify_email_email_header/);
      }
    });
  }
});
