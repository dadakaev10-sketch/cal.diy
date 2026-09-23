import { describe, expect, it } from "vitest";
import { readServiceCatalog, serviceCatalogSchema } from "./serviceCatalog";
import { EventTypeMetaDataSchema } from "./zod-utils";

const root = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Massage",
  icon: "handshake",
  parentId: null,
};
const child = { ...root, id: "22222222-2222-4222-8222-222222222222", name: "Rücken", parentId: root.id };
describe("service catalog", () => {
  it("defaults legacy metadata to a simple list", () => {
    expect(readServiceCatalog(null)).toEqual({ enabled: false, categories: [] });
  });
  it("returns only public catalog settings", () => {
    expect(
      readServiceCatalog({
        stripeCustomerId: "private",
        serviceCatalog: { enabled: true, categories: [root, child] },
      })
    ).toEqual({ enabled: true, categories: [root, child] });
  });
  it.each([
    [root, root],
    [{ ...root, parentId: root.id }],
    [child],
    [root, child, { ...root, id: "33333333-3333-4333-8333-333333333333", parentId: child.id }],
    [{ ...root, name: " " }],
    [{ ...root, icon: "arbitrary-html" }],
    Array(51).fill(root),
  ])("rejects invalid category trees", (...categories) => {
    expect(serviceCatalogSchema.safeParse({ enabled: true, categories }).success).toBe(false);
  });
  it("keeps ordering and disabled configuration", () => {
    expect(serviceCatalogSchema.parse({ enabled: false, categories: [root, child] }).categories).toEqual([
      root,
      child,
    ]);
  });
  it("preserves category assignment with price metadata and allows clearing", () => {
    expect(EventTypeMetaDataSchema.parse({ serviceCategoryId: root.id })?.serviceCategoryId).toBe(root.id);
    expect(EventTypeMetaDataSchema.parse({ serviceCategoryId: null })?.serviceCategoryId).toBeNull();
  });
});
