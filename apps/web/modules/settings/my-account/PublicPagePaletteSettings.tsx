"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { getPublicPagePalette, publicPagePalettes } from "@lib/publicPagePalette";
import { revalidateSettingsAppearance } from "app/(use-page-wrapper)/settings/(settings-layout)/my-account/appearance/actions";
import Link from "next/link";
import { useState } from "react";

export function PublicPagePaletteSettings({
  brandColor,
  username,
}: {
  brandColor: string | null;
  username: string | null;
}) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState(getPublicPagePalette(brandColor));
  const [saved, setSaved] = useState(brandColor);
  const mutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async (data) => {
      setSaved(data.brandColor ?? null);
      await utils.viewer.me.invalidate();
      revalidateSettingsAppearance();
      showToast(t("settings_updated_successfully"), "success");
    },
    onError: () => showToast(t("error_updating_settings"), "error"),
  });

  return (
    <section className="border-subtle mb-6 rounded-xl border p-6" aria-labelledby="public-palette-title">
      <h2 id="public-palette-title" className="text-default text-base font-semibold">
        {t("public_palette_title")}
      </h2>
      <p className="text-subtle mt-1 text-sm">{t("public_palette_description")}</p>
      <fieldset className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" disabled={mutation.isPending}>
        <legend className="sr-only">{t("public_palette_title")}</legend>
        {publicPagePalettes.map((palette) => (
          <label key={palette.id} className="relative cursor-pointer">
            <input
              type="radio"
              name="public-palette"
              value={palette.id}
              checked={selected.id === palette.id}
              onChange={() => setSelected(palette)}
              className="peer sr-only"
            />
            <span
              className="block rounded-xl border-2 p-3 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
              style={{
                background: palette.background,
                borderColor: selected.id === palette.id ? palette.accent : "transparent",
                color: palette.accent,
              }}>
              <span aria-hidden="true" className="flex flex-col items-center gap-2 rounded-lg bg-white p-3">
                <span className="h-8 w-8 rounded-full" style={{ background: palette.soft }} />
                <span className="h-1.5 w-12 rounded" style={{ background: palette.accent }} />
                <span className="h-4 w-full rounded" style={{ background: palette.soft }} />
              </span>
              <span className="mt-2 block text-center text-sm font-semibold">
                {t(`public_palette_${palette.id}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/settings/my-account/profile" className="text-default text-sm underline">
          {t("public_profile_edit")}
        </Link>
        <Button
          loading={mutation.isPending}
          disabled={saved === selected.accent}
          onClick={() =>
            mutation.mutate({
              brandColor: selected.accent,
              darkBrandColor: selected.accent,
              theme: "light",
            })
          }>
          {t("save")}
        </Button>
      </div>
      {username && (
        <Link
          href={`/${username}?redirect=false`}
          target="_blank"
          rel="noreferrer"
          className="text-subtle mt-4 inline-block text-sm underline">
          {t("public_profile_preview")}
        </Link>
      )}
    </section>
  );
}
