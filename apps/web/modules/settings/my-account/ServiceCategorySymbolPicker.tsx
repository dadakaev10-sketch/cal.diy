"use client";

import { ServiceCategorySymbol } from "@calcom/features/eventtypes/components/ServiceCategorySymbol";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { isCategoryEmoji, isServiceCategoryIcon, serviceCategoryIcons } from "@calcom/prisma/serviceCatalog";
import { Button } from "@calcom/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@calcom/ui/components/popover/Popover";
import { useId, useState } from "react";

const emojiGroups = [
  {
    key: "beauty",
    tags: "beauty beauty salon massage skin hair nails beauty kosmetik haut pflege haare nägel массаж красота волосы уход ногти",
    values: "💆 💆‍♀️ 💆‍♂️ 💇 💇‍♀️ 💇‍♂️ 💅 💄 💋 🧖 🧖‍♀️ 🧖‍♂️ 🧴 🧼 🫧 🧽 🪒 ✂️ 🪮 🪞 💧 🌿 🌸 🌺 🌹 🌷 🌻 ✨",
  },
  {
    key: "people",
    tags: "people faces smile happy love menschen gesicht lächeln liebe люди улыбка любовь",
    values: "😀 😃 😊 😎 🤩 🥰 😍 🤗 🙂 😌 🙌 👏 👍 👌 🤝 💪 🫶 👋 👩 👨 👩‍⚕️ 👨‍⚕️ 👩‍🏫 👨‍💻 👩‍🎨 👨‍🍳",
  },
  {
    key: "activities",
    tags: "sport fitness yoga music art travel sport musik kunst freizeit reise спорт йога музыка искусство",
    values: "🧘 🧘‍♀️ 🧘‍♂️ 🏋️ 🏃 🚴 🏊 ⚽ 🎾 🏀 🥊 🎯 🎨 🎭 🎵 🎤 🎧 📷 🎬 🎮 ✈️ 🚗 🚲 🏖️ 🏔️",
  },
  {
    key: "objects",
    tags: "work business calendar clock book coffee food symbols arbeit büro kalender zeit buch kaffee essen symbole работа календарь время книга кофе символы",
    values:
      "📅 🗓️ ⏰ ⏱️ ⌛ 📚 📖 ✏️ 📝 💻 📱 ☎️ 💼 🏢 🏠 🏥 🛒 🎁 💎 🏆 ⭐ 🌟 ❤️ 💚 💙 💜 🖤 🤍 ✅ ✔️ 🔥 💡 🚀 🌍 ☀️ 🌙 ☕ 🍵 🍽️ 🍰 🇦🇹 🇩🇪 🇬🇧 🇷🇺",
  },
];

export function ServiceCategorySymbolPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("icons");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [custom, setCustom] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const select = (symbol: string) => {
    onChange(symbol);
    setOpen(false);
  };
  const matches = (label: string) => label.toLocaleLowerCase().includes(query);
  const icons = serviceCategoryIcons.filter(
    (icon) => matches(t(`service_category_icon_${icon}`)) || matches(icon)
  );
  const emojis = emojiGroups
    .filter((item) => group === "all" || group === item.key)
    .flatMap((item) =>
      item.values
        .split(" ")
        .filter((emoji) => matches(`${emoji} ${item.tags} ${t(`category_symbol_group_${item.key}`)}`))
    );
  const choices = mode === "icons" ? icons : emojis;
  const customValue = custom.trim();
  return (
    <div className="min-w-0 flex-1">
      <span className="mb-1 block text-sm" id={`${id}-label`}>
        {t("service_category_icon")}
      </span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setSearch("");
            setCustom("");
            setMode(isServiceCategoryIcon(value) ? "icons" : "emojis");
          }
        }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            color="secondary"
            disabled={disabled}
            aria-labelledby={`${id}-label ${id}-value`}
            className="w-full justify-start gap-3">
            <ServiceCategorySymbol symbol={value} />
            <span id={`${id}-value`}>
              {isServiceCategoryIcon(value) ? t(`service_category_icon_${value}`) : value}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(360px,calc(100vw-24px))]"
          aria-label={t("category_symbol_choose")}>
          <div role="tablist" aria-label={t("category_symbol_choose")} className="mb-3 flex gap-2">
            {["icons", "emojis"].map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${id}-${tab}`}
                aria-controls={`${id}-panel`}
                aria-selected={mode === tab}
                onClick={() => {
                  setMode(tab);
                  setSearch("");
                }}
                className={`rounded-md border px-3 py-2 text-sm ${mode === tab ? "border-emphasis bg-subtle font-semibold" : "border-subtle"}`}>
                {t(`category_symbol_${tab}`)}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label={t("category_symbol_search")}
            placeholder={t("category_symbol_search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-default bg-default text-default mb-3 w-full rounded-md border px-3 py-2 text-sm"
          />
          {mode === "emojis" && (
            <select
              aria-label={t("category_symbol_group")}
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className="border-default bg-default text-default mb-3 w-full rounded-md border px-3 py-2 text-sm">
              <option value="all">{t("service_category_all")}</option>
              {emojiGroups.map((item) => (
                <option key={item.key} value={item.key}>
                  {t(`category_symbol_group_${item.key}`)}
                </option>
              ))}
            </select>
          )}
          <div
            role="tabpanel"
            id={`${id}-panel`}
            aria-labelledby={`${id}-${mode}`}
            className="max-h-60 overflow-y-auto">
            <div className="grid grid-cols-6 gap-1">
              {choices.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  aria-label={isServiceCategoryIcon(symbol) ? t(`service_category_icon_${symbol}`) : symbol}
                  title={isServiceCategoryIcon(symbol) ? t(`service_category_icon_${symbol}`) : symbol}
                  aria-pressed={value === symbol}
                  onClick={() => select(symbol)}
                  className={`hover:bg-subtle flex h-11 items-center justify-center rounded-md border focus-visible:outline focus-visible:outline-2 ${value === symbol ? "border-emphasis bg-subtle" : "border-transparent"}`}>
                  <ServiceCategorySymbol symbol={symbol} />
                </button>
              ))}
            </div>
            {choices.length === 0 && (
              <p role="status" className="text-subtle py-4 text-sm">
                {t("category_symbol_no_results")}
              </p>
            )}
          </div>
          {mode === "emojis" && (
            <div className="border-subtle mt-3 border-t pt-3">
              <label htmlFor={`${id}-custom`} className="mb-1 block text-sm">
                {t("category_symbol_custom")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${id}-custom`}
                  type="text"
                  value={custom}
                  onChange={(event) => setCustom(event.target.value)}
                  maxLength={32}
                  placeholder="💆🏽‍♀️"
                  className="border-default bg-default text-default min-w-0 flex-1 rounded-md border px-3 py-2"
                />
                {isCategoryEmoji(customValue) && <ServiceCategorySymbol symbol={customValue} />}
                <Button
                  type="button"
                  color="secondary"
                  disabled={!isCategoryEmoji(customValue)}
                  onClick={() => select(customValue)}>
                  {t("select")}
                </Button>
              </div>
              <p className="text-subtle mt-2 text-xs">{t("category_symbol_custom_help")}</p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
