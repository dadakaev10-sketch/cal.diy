import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { ServiceCatalog } from "@calcom/prisma/serviceCatalog";
import { Icon } from "@calcom/ui/components/icon";
import { groupPublicServices } from "@lib/serviceCatalog";
import { type ReactNode, useState } from "react";
import styles from "./service-catalog.module.css";
import type { PageProps } from "./users-public-view";

type Service = PageProps["eventTypes"][number];
export function PublicServiceCatalog({
  catalog,
  eventTypes,
  renderEvent,
}: {
  catalog: ServiceCatalog;
  eventTypes: Service[];
  renderEvent: (event: Service) => ReactNode;
}) {
  const { t } = useLocale();
  const [selected, setSelected] = useState("all");
  const [subcategory, setSubcategory] = useState("all");
  const groups = groupPublicServices(eventTypes, catalog);
  const active = groups.find((group) => (group.category?.id ?? "other") === selected);
  const children =
    active?.children.filter((child) =>
      active.events.some((event) => event.metadata?.serviceCategoryId === child.id)
    ) ?? [];
  const shown = active ? [active] : groups;
  return (
    <section className="min-w-0" aria-label={t("service_catalog_title")} data-testid="public-service-catalog">
      <div className={styles.categories} role="group" aria-label={t("service_category_filter")}>
        <button
          type="button"
          aria-pressed={!active}
          className={styles.category}
          onClick={() => {
            setSelected("all");
            setSubcategory("all");
          }}>
          <Icon name="grid-3x3" className="h-6 w-6" />
          <span>{t("service_category_all")}</span>
        </button>
        {groups.map((group) => (
          <button
            key={group.category?.id ?? "other"}
            type="button"
            aria-pressed={active === group}
            className={styles.category}
            onClick={() => {
              setSelected(group.category?.id ?? "other");
              setSubcategory("all");
            }}>
            <Icon name={group.category?.icon ?? "grid-3x3"} className="h-6 w-6" />
            <span>
              {group.category?.name ?? t("service_category_other")}{" "}
              <span className={styles.count}>({group.events.length})</span>
            </span>
          </button>
        ))}
      </div>
      <div className={children.length ? styles.withSidebar : undefined}>
        {children.length > 0 && (
          <nav className={styles.subcategories} aria-label={t("service_category_subcategories")}>
            <button type="button" aria-pressed={subcategory === "all"} onClick={() => setSubcategory("all")}>
              {t("service_category_all")}
            </button>
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                aria-pressed={subcategory === child.id}
                onClick={() => setSubcategory(child.id)}>
                {child.name}{" "}
                <span className={styles.count}>
                  ({active?.events.filter((event) => event.metadata?.serviceCategoryId === child.id).length})
                </span>
              </button>
            ))}
          </nav>
        )}
        <div className="min-w-0 space-y-6" aria-live="polite">
          {shown.map((group) => {
            const events =
              active && subcategory !== "all"
                ? group.events.filter((event) => event.metadata?.serviceCategoryId === subcategory)
                : group.events;
            return (
              <section key={group.category?.id ?? "other"}>
                <h2 className="mb-3 text-lg font-semibold">
                  {group.category?.name ?? t("service_category_other")}
                </h2>
                <div className="grid gap-3">{events.map(renderEvent)}</div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
