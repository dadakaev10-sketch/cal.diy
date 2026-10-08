import { z } from "zod";

export const serviceCategoryIcons = [
  "grid-3x3",
  "sparkles",
  "star",
  "calendar-heart",
  "handshake",
  "building",
  "activity",
  "book-open",
  "gift",
  "sun",
  "paintbrush",
  "map-pin",
  "clock",
  "users",
  "monitor",
  "phone",
  "video",
  "globe",
  "rocket",
  "shield-check",
  "file-text",
  "venetian-mask",
] as const;
export function isServiceCategoryIcon(value: string): value is (typeof serviceCategoryIcons)[number] {
  return z.enum(serviceCategoryIcons).safeParse(value).success;
}

export function isCategoryEmoji(value: string): boolean {
  if (!value || value.length > 32) return false;
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value));
  // Constructors keep Unicode matching compatible with packages that compile to ES5.
  // biome-ignore lint/complexity/useRegexLiterals: Unicode literals fail the ES5 TypeScript target.
  const pictographic = new RegExp("\\p{Extended_Pictographic}", "u");
  // biome-ignore lint/complexity/useRegexLiterals: Unicode literals fail the ES5 TypeScript target.
  const flagOrKeycap = new RegExp("^(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3)$", "u");
  return graphemes.length === 1 && (pictographic.test(value) || flagOrKeycap.test(value));
}

export const serviceCategorySymbolSchema = z.union([
  z.enum(serviceCategoryIcons),
  z.string().max(32).refine(isCategoryEmoji, "Choose one emoji or a supported icon"),
]);

export const serviceCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  icon: serviceCategorySymbolSchema,
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
