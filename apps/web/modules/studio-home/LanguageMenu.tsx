"use client";

import type { PublicBookingLanguage } from "@calcom/lib/publicBookingLanguage";
import { publicBookingLanguageNames, publicBookingLanguages } from "@calcom/lib/publicBookingLanguage";
import { useEffect, useId, useRef, useState } from "react";
import WorldIcon from "./LanguageWorldIcon";
import styles from "./language-menu.module.css";

const flags: Record<PublicBookingLanguage, string> = {
  de: "🇩🇪",
  en: "🇺🇸",
  ru: "🇷🇺",
  es: "🇪🇸",
  it: "🇮🇹",
  fr: "🇫🇷",
};

export function LanguageMenu({
  language,
  label,
  available = publicBookingLanguages,
}: {
  language: PublicBookingLanguage;
  label: string;
  available?: readonly PublicBookingLanguage[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      ref={root}
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}>
        <WorldIcon />
      </button>
      {open && (
        <div id={menuId} className={styles.menu} role="group" aria-label={label}>
          {available.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              className={styles.option}
              aria-pressed={language === code}
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("lang", code);
                window.location.assign(url.toString());
                setOpen(false);
                trigger.current?.focus();
              }}>
              <span aria-hidden="true">{flags[code]}</span>
              <span className={styles.label}>{publicBookingLanguageNames[code]}</span>
              {language === code && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
