import type { ServiceCatalog } from "@calcom/prisma/serviceCatalog";
import { describe, expect, it } from "vitest";
import { groupPublicServices, publicServiceCatalog } from "./serviceCatalog";

const catalog: ServiceCatalog = {
  enabled: true,
  categories: [
    { id: "root", name: "Beauty", icon: "sparkles", parentId: null },
    { id: "child", name: "IPL", icon: "sparkles", parentId: "root" },
    { id: "empty", name: "Empty", icon: "star", parentId: null },
  ],
};
const event = (id: number, serviceCategoryId: string | null, hidden = false) => ({
  id,
  hidden,
  metadata: { serviceCategoryId },
});
describe("public service grouping", () => {
  it("groups children with parent and preserves service ordering", () => {
    const groups = groupPublicServices([event(2, "child"), event(1, "root")], catalog);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((item) => item.id)).toEqual([2, 1]);
  });
  it("does not expose hidden services or their category counts", () => {
    expect(groupPublicServices([event(1, "empty", true)], catalog)).toEqual([]);
  });
  it("keeps deleted, unknown and unassigned categories bookable", () => {
    const groups = groupPublicServices(
      [event(1, "deleted"), event(2, null), { id: 3, metadata: null }],
      catalog
    );
    expect(groups[0].category).toBeNull();
    expect(groups[0].events).toHaveLength(3);
  });
  it("returns each visible service exactly once", () => {
    const groups = groupPublicServices(
      [event(1, "child"), event(2, "root"), event(3, null), event(4, "empty", true)],
      catalog
    );
    expect(groups.flatMap((group) => group.events.map((item) => item.id))).toEqual([1, 2, 3]);
  });
});

it("does not publish category definitions when disabled or used only by hidden services", () => {
  expect(publicServiceCatalog({ serviceCatalog: { enabled: false, categories: [] } }, [])).toEqual({
    enabled: false,
    categories: [],
  });
  const category = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Private",
    icon: "star",
    parentId: null,
  };
  expect(
    publicServiceCatalog({ serviceCatalog: { enabled: true, categories: [category] } }, [
      event(1, category.id, true),
    ]).categories
  ).toEqual([]);
});
