import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { readServiceCatalog } from "@calcom/prisma/serviceCatalog";
import { trpc } from "@calcom/trpc/react";
import Link from "next/link";
import { useFormContext } from "react-hook-form";

export function ServiceCategorySettings({ ownerId }: { ownerId: number | null }) {
  const { t } = useLocale();
  const { data: user, isPending } = trpc.viewer.me.get.useQuery();
  const { watch, setValue } = useFormContext<FormValues>();
  const selected = watch("metadata.serviceCategoryId");
  const { categories } = readServiceCatalog(user?.metadata);
  if (user && ownerId && user.id !== ownerId) return null;
  const roots = categories.filter((item) => !item.parentId);
  return (
    <section className="border-subtle rounded-lg border p-6">
      <label htmlFor="service-category" className="text-default block text-sm font-semibold">
        {t("service_category_assignment")}
      </label>
      <select
        id="service-category"
        className="border-default bg-default text-default mt-2 w-full rounded-md border px-3 py-2 text-sm"
        disabled={isPending || !user}
        value={selected ?? ""}
        onChange={(e) =>
          setValue("metadata.serviceCategoryId", e.target.value || null, { shouldDirty: true })
        }>
        <option value="">{t("service_category_none")}</option>
        {selected && !categories.some((item) => item.id === selected) && (
          <option value={selected}>{t("service_category_removed")}</option>
        )}
        {roots.flatMap((root) => [
          <option key={root.id} value={root.id}>
            {root.name}
          </option>,
          ...categories
            .filter((item) => item.parentId === root.id)
            .map((child) => (
              <option key={child.id} value={child.id}>
                {root.name} / {child.name}
              </option>
            )),
        ])}
      </select>
      <Link
        href="/settings/my-account/appearance"
        target="_blank"
        rel="noreferrer"
        className="text-subtle mt-3 inline-block text-sm underline">
        {t("service_category_manage")}
      </Link>
    </section>
  );
}
