import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  key: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
  events: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findFirst: mocks.owner },
    apiKey: { findUnique: mocks.key },
    booking: { findMany: mocks.list, count: mocks.count },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@calcom/features/auth/lib/studioAccountSecurity", () => ({
  studioAccountRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@calcom/features/eventtypes/lib/getEventTypesPublic", () => ({ getEventTypesPublic: mocks.events }));
vi.mock("@calcom/app-store/_utils/payments/getPaymentAppData", () => ({
  getPaymentAppData: () => ({ enabled: false }),
}));
vi.mock("@lib/fixmitBilling", () => ({ billingEnabled: () => false, entitled: vi.fn() }));

import { GET } from "../app/api/amina/[resource]/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIXMIT_AMINA_READ_ENABLED", "true");
  vi.stubEnv("API_KEY_PREFIX", "cal_");
  mocks.owner.mockResolvedValue({ id: 42 });
  mocks.key.mockResolvedValue({ userId: 42, teamId: null, expiresAt: null });
  mocks.transaction.mockResolvedValue([[], 0]);
});
const get = (resource: string, token = "cal_" + "a".repeat(32), query = "") =>
  GET(
    new Request(`https://fixmit.com/api/amina/${resource}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ resource }) }
  );

it("bleibt ohne Aktivierung geschlossen", async () => {
  vi.stubEnv("FIXMIT_AMINA_READ_ENABLED", "false");
  expect((await get("services")).status).toBe(404);
  expect(mocks.owner).not.toHaveBeenCalled();
});
it("verweigert Buchungen ohne Schlüssel", async () => {
  expect((await get("bookings", "")).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});
it.each([
  null,
  { userId: 7, teamId: null, expiresAt: null },
  { userId: 42, teamId: 3, expiresAt: null },
  { userId: 42, teamId: null, expiresAt: new Date(0) },
])("verweigert fremde, Team- und abgelaufene Schlüssel", async (access) => {
  mocks.key.mockResolvedValue(access);
  expect((await get("bookings")).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("begrenzt Buchungen fest auf den Eigentümer und paginiert", async () => {
  const response = await get("bookings", undefined, "?view=all&offset=50&userId=7");
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({ where: { userId: 42 }, take: 50, skip: 50 })
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("verweigert ungültige Pagination", async () => {
  expect((await get("bookings", undefined, "?offset=-1")).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("veröffentlicht nur ausgewählte Leistungsfelder, niemals Metadaten", async () => {
  mocks.events.mockResolvedValue([
    {
      id: 1,
      title: "Testleistung",
      description: "Beschreibung",
      length: 60,
      slug: "testleistung",
      metadata: {
        private: "secret",
        serviceDisplayPrice: { enabled: true, amountMinor: 35000, currency: "EUR" },
      },
    },
  ]);
  const response = await get("services", "");
  expect(await response.json()).toEqual({
    catalog: { enabled: false, categories: [] },
    services: [
      {
        id: 1,
        category_id: null,
        title: "Testleistung",
        description: "Beschreibung",
        minutes: 60,
        url: "https://fixmit.com/azbeauty/testleistung",
        price: { amountMinor: 35000, currency: "EUR" },
      },
    ],
  });
  expect(mocks.key).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});

it("übernimmt vorhandene Haupt- und Unterkategorien ohne private Metadaten", async () => {
  const root = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Gesicht",
    icon: "sparkles",
    parentId: null,
  };
  const child = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Pflege",
    icon: "sun",
    parentId: root.id,
  };
  const unused = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Nicht verwendet",
    icon: "star",
    parentId: null,
  };
  mocks.owner.mockResolvedValue({
    id: 42,
    metadata: { private: "secret", serviceCatalog: { enabled: true, categories: [root, child, unused] } },
  });
  mocks.events.mockResolvedValue([
    {
      id: 1,
      title: "Pflege",
      description: "",
      length: 60,
      slug: "pflege",
      metadata: { serviceCategoryId: child.id },
    },
  ]);
  const response = await get("services", "");
  const data = await response.json();
  expect(data.catalog).toEqual({ enabled: true, categories: [root, child] });
  expect(data.services[0].category_id).toBe(child.id);
  expect(JSON.stringify(data)).not.toContain("secret");
});
