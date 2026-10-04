"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { type LandingPage, type LandingSection, socialPlatforms } from "@calcom/prisma/landingPage";
import { Button } from "@calcom/ui/components/button";

const inputClass = "border-default bg-default text-default mt-1 w-full rounded-md border px-3 py-2 text-sm";
export function LandingSectionsSettings({
  page,
  change,
}: {
  page: LandingPage;
  change: (patch: Partial<LandingPage>) => void;
}) {
  const { t } = useLocale();
  const update = (id: string, patch: Partial<LandingSection>) =>
    change({
      sections: page.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    });
  const move = (index: number, delta: number) => {
    const sections = [...page.sections];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    change({ sections });
  };
  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={page.showBookingButton}
          onChange={(e) => change({ showBookingButton: e.target.checked })}
        />
        {t("landing_show_booking")}
      </label>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t("landing_socials")}</h3>
        <p className="text-subtle text-xs">{t("landing_socials_help")}</p>
        {socialPlatforms.map((platform) => (
          <label key={platform} className="block text-sm">
            {platform === "x" ? "X" : platform.charAt(0).toUpperCase() + platform.slice(1)}
            <input
              type="url"
              className={inputClass}
              placeholder="https://"
              maxLength={2000}
              value={page.socialLinks.find((link) => link.platform === platform)?.url || ""}
              onChange={(e) => {
                const socialLinks = page.socialLinks.filter((link) => link.platform !== platform);
                if (e.target.value) socialLinks.push({ platform, url: e.target.value });
                change({ socialLinks });
              }}
            />
          </label>
        ))}
      </div>
      <h3 className="text-sm font-semibold">{t("landing_sections")}</h3>
      <p className="text-subtle text-xs">{t("landing_sections_help")}</p>
      {page.sections.map((section, index) => (
        <fieldset key={section.id} className="border-subtle space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            {index + 1}. {section.title || t(`landing_section_${section.type}`)}
          </legend>
          <label className="block text-sm">
            {t("landing_section_title")}
            <input
              className={inputClass}
              maxLength={100}
              value={section.title}
              onChange={(e) => update(section.id, { title: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {t("landing_description")}
            <textarea
              className={inputClass}
              rows={3}
              maxLength={1500}
              value={section.description}
              onChange={(e) => update(section.id, { description: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {t("landing_section_image")}
            <input
              type="url"
              className={inputClass}
              placeholder="https://"
              maxLength={2000}
              value={section.image}
              onChange={(e) => update(section.id, { image: e.target.value })}
            />
          </label>
          {section.type === "link" && (
            <label className="block text-sm">
              {t("landing_link_url")}
              <input
                type="url"
                className={inputClass}
                placeholder="https://"
                maxLength={2000}
                value={section.url}
                onChange={(e) => update(section.id, { url: e.target.value })}
              />
            </label>
          )}
          {section.type !== "text" && (
            <>
              <label className="block text-sm">
                {t("landing_button_label")}
                <input
                  className={inputClass}
                  placeholder={t(section.type === "booking" ? "landing_book" : "landing_section_open")}
                  maxLength={40}
                  value={section.buttonLabel}
                  onChange={(e) => update(section.id, { buttonLabel: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                {t("landing_price_label")}
                <input
                  className={inputClass}
                  maxLength={40}
                  value={section.priceLabel}
                  onChange={(e) => update(section.id, { priceLabel: e.target.value })}
                />
              </label>
              <p className="text-subtle text-xs">
                {t(section.type === "booking" ? "landing_booking_section_help" : "landing_price_help")}
              </p>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={section.enabled}
              onChange={(e) => update(section.id, { enabled: e.target.checked })}
            />
            {t("landing_section_visible")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" color="secondary" disabled={index === 0} onClick={() => move(index, -1)}>
              {t("landing_move_up")}
            </Button>
            <Button
              type="button"
              color="secondary"
              disabled={index === page.sections.length - 1}
              onClick={() => move(index, 1)}>
              {t("landing_move_down")}
            </Button>
            <Button
              type="button"
              color="secondary"
              onClick={() => change({ sections: page.sections.filter((item) => item.id !== section.id) })}>
              {t("landing_section_remove")}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        {(["link", "text", "booking"] as const).map((type) => (
          <Button
            key={type}
            type="button"
            color="secondary"
            disabled={page.sections.length >= 12}
            onClick={() =>
              change({
                sections: [
                  ...page.sections,
                  {
                    id: crypto.randomUUID(),
                    type,
                    title: t(`landing_section_${type}`),
                    description: "",
                    image: "",
                    url: "",
                    buttonLabel: "",
                    priceLabel: "",
                    enabled: true,
                  },
                ],
              })
            }>
            {t(`landing_add_${type}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
