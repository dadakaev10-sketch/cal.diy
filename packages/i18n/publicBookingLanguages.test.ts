import { describe, expect, it } from "vitest";
import de from "./locales/de/common.json";
import en from "./locales/en/common.json";
import es from "./locales/es/common.json";
import fr from "./locales/fr/common.json";
import itLocale from "./locales/it/common.json";
import ru from "./locales/ru/common.json";

const publicKeys = [
  "booking_page_language",
  "booking_page_language_help",
  "landing_book",
  "landing_links",
  "landing_section_open",
  "landing_socials",
  "landing_back",
  "service_catalog_title",
  "service_category_all",
  "service_category_filter",
  "service_category_other",
  "service_category_subcategories",
  "service_category_choose",
  "booking_payment_total",
  "booking_payment_balance",
  "booking_payment_deposit",
  "booking_payment_remaining",
  "booking_payment_paid",
  "booking_payment_summary",
  "booking_payment_balance_help",
  "booking_payment_config_error",
  "booking_payment_deposit_paid",
  "booking_payment_received",
];

describe("public booking translations", () => {
  it.each(
    Object.entries({ en, de, es, ru, it: itLocale, fr })
  )("%s contains native translations of custom booking and payment labels", (_locale, translations) => {
    const catalog: Record<string, string> = translations;
    for (const key of publicKeys) {
      expect(catalog[key], key).toBeTypeOf("string");
      expect(catalog[key]?.trim(), key).not.toBe("");
    }
  });
});
