import { z } from "zod";

export const serviceCategoryIcons = [
  "grid-3x3",
  "sparkles",
  "star",
  "calendar-heart",
  "handshake",
  "building",
] as const;
export const serviceCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  icon: z.enum(serviceCategoryIcons),
  parentId: z.string().uuid().nullable(),
});
export const serviceCatalogSchema = z
  .object({
    enabled: z.boolean(),
    categories: z.array(serviceCategorySchema).max(50),
  })
  .superRefine(({ categories }, ctx) => {
    const ids = new Set(categories.map((category) => category.id));
    if (ids.size !== categories.length) ctx.addIssue({ code: "custom", message: "Duplicate category IDs" });
    for (const category of categories) {
      if (!category.parentId) continue;
      const parent = categories.find((item) => item.id === category.parentId);
      if (!parent || parent.parentId || parent.id === category.id) {
        ctx.addIssue({ code: "custom", message: "Categories support one level of subcategories" });
      }
    }
  });
export type ServiceCatalog = z.infer<typeof serviceCatalogSchema>;
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export function readServiceCatalog(metadata: unknown): ServiceCatalog {
  const parsed = z.object({ serviceCatalog: serviceCatalogSchema }).safeParse(metadata);
  return parsed.success ? parsed.data.serviceCatalog : { enabled: false, categories: [] };
}
