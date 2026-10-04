"use client";

import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { type LandingPage, landingPageSchema, readLandingPage } from "@calcom/prisma/landingPage";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { PublicLandingPage } from "@calcom/web/modules/users/views/PublicLandingPage";
import { getPublicPagePalette } from "@lib/publicPagePalette";
import { revalidateSettingsAppearance } from "app/(use-page-wrapper)/settings/(settings-layout)/my-account/appearance/actions";
import Link from "next/link";
import { type CSSProperties, useState } from "react";

const inputClass = "border-default bg-default text-default mt-1 w-full rounded-md border px-3 py-2 text-sm";
export function LandingPageSettings({
  user,
}: {
  user: {
    metadata: unknown;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    brandColor: string | null;
  };
}) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(() => readLandingPage(user.metadata));
  const [saved, setSaved] = useState(() => readLandingPage(user.metadata));
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const palette = getPublicPagePalette(user.brandColor);
  const parsed = landingPageSchema.safeParse(page);
  const dirty = JSON.stringify(page) !== JSON.stringify(saved);
  const mutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async (data) => {
      const persisted = readLandingPage(data.metadata);
      setPage(persisted);
      setSaved(persisted);
      await utils.viewer.me.invalidate();
      revalidateSettingsAppearance();
      showToast(t("settings_updated_successfully"), "success");
    },
    onError: () => showToast(t("error_updating_settings"), "error"),
  });
  const change = (patch: Partial<LandingPage>) => setPage((current) => ({ ...current, ...patch }));
  const upload = async (file?: File) => {
    if (!file) return;
    setImageError(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2000000) {
      setImageError(true);
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject());
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      change({ coverImage: data });
    } catch {
      setImageError(true);
    } finally {
      setUploading(false);
    }
  };
  return (
    <section className="border-subtle mb-6 rounded-xl border p-6" aria-labelledby="landing-settings-title">
      <h2 id="landing-settings-title" className="text-default text-base font-semibold">
        {t("landing_title")}
      </h2>
      <p className="text-subtle mt-1 text-sm">{t("landing_help")}</p>
      <fieldset className="mt-5 space-y-5" disabled={mutation.isPending || uploading}>
        <legend className="sr-only">{t("landing_mode")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["booking", "landing"] as const).map((mode) => (
            <label
              className={`border-default cursor-pointer rounded-xl border p-4 ${page.mode === mode ? "bg-subtle" : ""}`}
              key={mode}>
              <input
                type="radio"
                name="public-page-mode"
                value={mode}
                checked={page.mode === mode}
                onChange={() => change({ mode })}
              />
              <span className="ml-2 text-sm font-semibold">{t(`landing_mode_${mode}`)}</span>
              <span className="text-subtle mt-2 block text-sm">{t(`landing_mode_${mode}_help`)}</span>
            </label>
          ))}
        </div>
        {page.mode === "landing" && (
          <>
            <label className="block text-sm">
              {t("landing_layout")}
              <select
                className={inputClass}
                value={page.layout}
                onChange={(e) => change({ layout: e.target.value === "cover" ? "cover" : "portrait" })}>
                <option value="portrait">{t("landing_layout_portrait")}</option>
                <option value="cover">{t("landing_layout_cover")}</option>
              </select>
            </label>
            <label className="block text-sm">
              {t("landing_headline")}
              <input
                className={inputClass}
                value={page.headline}
                maxLength={100}
                placeholder={user.name || user.username || ""}
                onChange={(e) => change({ headline: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              {t("landing_description")}
              <textarea
                className={inputClass}
                value={page.description}
                maxLength={1500}
                rows={4}
                onChange={(e) => change({ description: e.target.value })}
              />
            </label>
            <p className="text-subtle text-xs">{t("landing_profile_fallback")}</p>
            <label className="block text-sm">
              {t("landing_image")}
              <input
                className={inputClass}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-subtle text-xs">{t("landing_image_help")}</p>
            {imageError && (
              <p role="alert" className="text-error text-sm">
                {t("landing_image_error")}
              </p>
            )}
            {page.coverImage && (
              <Button type="button" color="secondary" onClick={() => change({ coverImage: "" })}>
                {t("landing_image_remove")}
              </Button>
            )}
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("landing_links")}</p>
              {page.links.map((link, index) => (
                <div key={index} className="border-subtle rounded-lg border p-3">
                  <label className="block text-sm">
                    {t("landing_link_label")}
                    <input
                      className={inputClass}
                      value={link.label}
                      maxLength={40}
                      onChange={(e) =>
                        change({
                          links: page.links.map((item, i) =>
                            i === index ? { ...item, label: e.target.value } : item
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="mt-2 block text-sm">
                    {t("landing_link_url")}
                    <input
                      className={inputClass}
                      type="url"
                      value={link.url}
                      maxLength={2000}
                      placeholder="https://"
                      onChange={(e) =>
                        change({
                          links: page.links.map((item, i) =>
                            i === index ? { ...item, url: e.target.value } : item
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    color="secondary"
                    className="mt-2"
                    onClick={() => change({ links: page.links.filter((_, i) => i !== index) })}>
                    {t("landing_link_remove")}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                color="secondary"
                disabled={page.links.length >= 5}
                onClick={() => change({ links: [...page.links, { label: "", url: "" }] })}>
                {t("landing_link_add")}
              </Button>
            </div>
            <details className="border-subtle rounded-xl border p-4" open>
              <summary className="cursor-pointer text-sm font-medium">{t("landing_preview")}</summary>
              <div
                className="mx-auto mt-4 max-w-sm"
                style={
                  {
                    "--profile-background": palette.background,
                    "--profile-soft": palette.soft,
                    "--profile-accent": palette.accent,
                  } as CSSProperties
                }>
                <PublicLandingPage
                  preview
                  page={{ ...page, links: parsed.success ? parsed.data.links : [] }}
                  name={user.name || user.username || ""}
                  avatarUrl={getUserAvatarUrl({ avatarUrl: user.avatarUrl })}
                  bio={user.bio}
                  bookingAction={
                    <button type="button" disabled>
                      {t("landing_book")}
                    </button>
                  }
                />
              </div>
              <p className="text-subtle mt-3 text-xs">{t("landing_preview_help")}</p>
            </details>
          </>
        )}
        {!parsed.success && (
          <p role="alert" className="text-error text-sm">
            {t("landing_invalid")}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {user.username && (
            <Link href={`/${user.username}`} target="_blank" className="mr-auto text-sm underline">
              {t("landing_open")}
            </Link>
          )}
          <Button
            type="button"
            color="secondary"
            disabled={!dirty}
            onClick={() => {
              setPage(saved);
              setImageError(false);
            }}>
            {t("service_catalog_discard")}
          </Button>
          <Button
            type="button"
            disabled={!dirty || !parsed.success}
            loading={mutation.isPending}
            onClick={() => {
              if (parsed.success) mutation.mutate({ metadata: { landingPage: parsed.data } });
            }}>
            {t("save")}
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
