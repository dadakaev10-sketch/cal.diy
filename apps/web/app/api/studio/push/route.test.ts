import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  tx: {
    $executeRaw: vi.fn(),
    notificationsSubscriptions: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: mocks.session }));
vi.mock("@calcom/features/auth/lib/studioAccountSecurity", () => ({ studioAccountRateLimit: mocks.limit }));
vi.mock("@calcom/lib/constants", () => ({ WEBAPP_URL: "https://fixmit.com" }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("@calcom/prisma", () => ({
  default: { $transaction: async (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx) },
}));

import { DELETE, POST } from "./route";

const token = "ab".repeat(32);
const body = { token, environment: "sandbox" };
const req = (value: unknown = body, origin = "https://fixmit.com") =>
  new Request("https://fixmit.com/api/studio/push", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 7 } });
  mocks.limit.mockResolvedValue(true);
  mocks.tx.notificationsSubscriptions.findMany.mockResolvedValue([]);
});
describe("studio device authorization", () => {
  it("requires login", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(401);
    expect(mocks.tx.notificationsSubscriptions.create).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin", async () => {
    expect((await POST(req(body, "https://other.invalid"))).status).toBe(403);
  });
  it("rejects invalid tokens and oversized input", async () => {
    expect((await POST(req({ token: "bad", environment: "sandbox" }))).status).toBe(400);
    expect((await POST(req("x".repeat(3000)))).status).toBe(400);
  });
  it("binds a device to the authenticated account only", async () => {
    expect((await POST(req())).status).toBe(200);
    expect(mocks.tx.notificationsSubscriptions.create).toHaveBeenCalledWith({
      data: { userId: 7, subscription: JSON.stringify({ ...body, kind: "fixmit-apns-v1", sent: [] }) },
    });
  });
  it("does not remove another account's registration", async () => {
    mocks.tx.notificationsSubscriptions.findMany.mockResolvedValue([
      { id: 12, userId: 8, subscription: JSON.stringify({ ...body, kind: "fixmit-apns-v1", sent: [] }) },
    ]);
    expect((await DELETE(req())).status).toBe(200);
    expect(mocks.tx.notificationsSubscriptions.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
  });
  it("preserves delivery state when registering again", async () => {
    mocks.tx.notificationsSubscriptions.findMany.mockResolvedValue([
      {
        id: 11,
        userId: 7,
        subscription: JSON.stringify({ ...body, kind: "fixmit-apns-v1", sent: ["sent"] }),
      },
    ]);
    await POST(req());
    expect(mocks.tx.notificationsSubscriptions.create).not.toHaveBeenCalled();
  });
});
