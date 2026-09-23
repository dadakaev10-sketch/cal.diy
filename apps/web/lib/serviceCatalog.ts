import { readServiceCatalog, type ServiceCatalog, type ServiceCategory } from "@calcom/prisma/serviceCatalog";

type CategorizedService = { hidden?: boolean; metadata: { serviceCategoryId?: string | null } | null };
export function groupPublicServices<T extends CategorizedService>(services: T[], catalog: ServiceCatalog) {
  const visible = services.filter((service) => !service.hidden);
  const roots = catalog.categories.filter((category) => !category.parentId);
  const groups = roots
    .map((category) => {
      const children = catalog.categories.filter((child) => child.parentId === category.id);
      const ids = new Set([category.id, ...children.map((child) => child.id)]);
      const events = visible.filter((service) => ids.has(service.metadata?.serviceCategoryId ?? ""));
      return { category: category as ServiceCategory | null, children, events };
    })
    .filter((group) => group.events.length > 0);
  const knownIds = new Set(catalog.categories.map((category) => category.id));
  const uncategorized = visible.filter((service) => !knownIds.has(service.metadata?.serviceCategoryId ?? ""));
  if (uncategorized.length) groups.push({ category: null, children: [], events: uncategorized });
  return groups;
}

export function publicServiceCatalog(metadata: unknown, services: CategorizedService[]): ServiceCatalog {
  const catalog = readServiceCatalog(metadata);
  if (!catalog.enabled) return { enabled: false, categories: [] };
  const used = new Set(
    services.filter((service) => !service.hidden).map((service) => service.metadata?.serviceCategoryId)
  );
  for (const category of catalog.categories) {
    if (used.has(category.id) && category.parentId) used.add(category.parentId);
  }
  return { enabled: true, categories: catalog.categories.filter((category) => used.has(category.id)) };
}
