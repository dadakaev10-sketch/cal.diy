"use client";

import type { PublicBookingLanguage } from "@calcom/lib/publicBookingLanguage";
import { publicBookingLanguageNames, publicBookingLanguages } from "@calcom/lib/publicBookingLanguage";

export function PublicBookingLanguageSelect({ language, label }: { language: PublicBookingLanguage; label: string }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-start px-4 py-3">
      <label className="text-default flex items-center gap-2 text-sm">
        <span aria-hidden="true">🌐</span>
        <select
          aria-label={label}
          value={language}
          className="border-subtle bg-default rounded-md border px-3 py-2"
          onChange={(event) => {
            const url = new URL(window.location.href);
            url.searchParams.set("lang", event.target.value);
            window.location.assign(url.toString());
          }}>
          {publicBookingLanguages.map((code) => (
            <option key={code} value={code} lang={code}>
              {publicBookingLanguageNames[code]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
