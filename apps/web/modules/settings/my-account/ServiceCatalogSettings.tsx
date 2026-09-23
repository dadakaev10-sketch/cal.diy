"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  readServiceCatalog,
  type ServiceCatalog,
  type ServiceCategory,
  serviceCatalogSchema,
  serviceCategoryIcons,
} from "@calcom/prisma/serviceCatalog";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsAppearance } from "app/(use-page-wrapper)/settings/(settings-layout)/my-account/appearance/actions";
import { useState } from "react";

const inputClass = "border-default bg-default text-default w-full rounded-md border px-3 py-2 text-sm";

export function ServiceCatalogSettings({ metadata }: { metadata: unknown }) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [catalog, setCatalog] = useState(() => readServiceCatalog(metadata));
  const [saved, setSaved] = useState(() => JSON.stringify(readServiceCatalog(metadata)));
  const mutation = trpc.viewer.me.updateProfile.useMutation({
    onSuccess: async (data) => {
      const persisted = readServiceCatalog(data.metadata);
      setCatalog(persisted);
      setSaved(JSON.stringify(persisted));
      await utils.viewer.me.invalidate();
      revalidateSettingsAppearance();
      showToast(t("settings_updated_successfully"), "success");
    },
    onError: () => showToast(t("error_updating_settings"), "error"),
  });
  const change = (id: string, patch: Partial<ServiceCategory>) =>
    setCatalog((current) => ({
      ...current,
      categories: current.categories.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  const move = (index: number, direction: number) =>
    setCatalog((current) => {
      const categories = [...current.categories];
      [categories[index], categories[index + direction]] = [categories[index + direction], categories[index]];
      return { ...current, categories };
    });
  const remove = (id: string) =>
    setCatalog((current) => ({
      ...current,
      categories: current.categories
        .filter((item) => item.id !== id)
        .map((item) => (item.parentId === id ? { ...item, parentId: null } : item)),
    }));
  const valid = serviceCatalogSchema.safeParse(catalog).success;
  const dirty = JSON.stringify(catalog) !== saved;
  return (
    <section className="border-subtle mb-6 rounded-xl border p-6" aria-labelledby="service-catalog-title">
      <h2 id="service-catalog-title" className="text-default text-base font-semibold">
        {t("service_catalog_title")}
      </h2>
      <p className="text-subtle mt-1 text-sm">{t("service_catalog_help")}</p>
      <fieldset disabled={mutation.isPending} className="mt-5 space-y-4">
        <label className="block text-sm font-medium">
          {t("service_catalog_layout")}
          <select
            className={`${inputClass} mt-1`}
            value={catalog.enabled ? "categories" : "list"}
            onChange={(e) => setCatalog({ ...catalog, enabled: e.target.value === "categories" })}>
            <option value="list">{t("service_catalog_list")}</option>
            <option value="categories">{t("service_catalog_grouped")}</option>
          </select>
        </label>
        <ol className="space-y-3">
          {catalog.categories.map((category, index) => (
            <li
              key={category.id}
              className="border-subtle rounded-lg border p-3"
              data-testid="service-category-row">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  {t("service_category_name")}
                  <input
                    className={`${inputClass} mt-1`}
                    value={category.name}
                    maxLength={60}
                    required
                    onChange={(e) => change(category.id, { name: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  {t("service_category_parent")}
                  <select
                    className={`${inputClass} mt-1`}
                    value={category.parentId ?? ""}
                    disabled={catalog.categories.some((item) => item.parentId === category.id)}
                    onChange={(e) => change(category.id, { parentId: e.target.value || null })}>
                    <option value="">{t("service_category_root")}</option>
                    {catalog.categories
                      .filter((item) => !item.parentId && item.id !== category.id)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">
                  {t("service_category_icon")}
                  <select
                    className={`${inputClass} mt-1`}
                    value={category.icon}
                    onChange={(e) =>
                      change(category.id, {
                        icon: serviceCategoryIcons.find((icon) => icon === e.target.value) ?? "grid-3x3",
                      })
                    }>
                    {serviceCategoryIcons.map((icon) => (
                      <option key={icon} value={icon}>
                        {t(`service_category_icon_${icon}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <Icon name={category.icon} className="mb-2 h-5 w-5" />
                <Button
                  type="button"
                  color="secondary"
                  aria-label={t("service_category_up", { name: category.name })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}>
                  <Icon name="arrow-up" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  color="secondary"
                  aria-label={t("service_category_down", { name: category.name })}
                  disabled={index === catalog.categories.length - 1}
                  onClick={() => move(index, 1)}>
                  <Icon name="arrow-down" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  color="secondary"
                  aria-label={t("service_category_remove", { name: category.name })}
                  onClick={() => remove(category.id)}>
                  <Icon name="trash" className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          color="secondary"
          disabled={catalog.categories.length >= 50}
          onClick={() =>
            setCatalog(
              (current): ServiceCatalog => ({
                ...current,
                categories: [
                  ...current.categories,
                  { id: crypto.randomUUID(), name: "", parentId: null, icon: "grid-3x3" },
                ],
              })
            )
          }>
          {t("service_category_add")}
        </Button>
        {!valid && (
          <p role="status" className="text-subtle text-sm">
            {t("service_catalog_invalid")}
          </p>
        )}
        <p className="text-subtle text-sm">{t("service_category_remove_help")}</p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            color="secondary"
            disabled={!dirty}
            onClick={() => setCatalog(JSON.parse(saved) as ServiceCatalog)}>
            {t("service_catalog_discard")}
          </Button>
          <Button
            type="button"
            disabled={!dirty || !valid}
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate({ metadata: { serviceCatalog: serviceCatalogSchema.parse(catalog) } })
            }>
            {t("save")}
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
