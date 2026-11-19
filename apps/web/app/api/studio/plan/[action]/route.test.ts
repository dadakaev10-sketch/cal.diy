import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), update: vi.fn(), guard: vi.fn() }));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: m.session }));
vi.mock("@calcom/prisma", () => ({ default: { user: { findUnique: m.user, update: m.update } } }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("@lib/studioAccountRequest", () => ({
  guardStudioAccountRequest: m.guard,
  readStudioAccountBody: (req: Request) => req.json(),
}));

import { GET, POST } from "./route";

const params = (action = "status") => ({ params: Promise.resolve({ action }) });
const request = (body = {}) =>
  new NextRequest("https://fixmit.com/api/studio/plan/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ user: { id: 7 } });
  m.user.mockResolvedValue({ locked: false, hideBranding: false, studioProGrant: { userId: 7 } });
  m.update.mockResolvedValue({ hideBranding: true });
});
describe("founding studio plan status", () => {
  it("requires a signed-in owner", async () => {
    m.session.mockResolvedValue(null);
    expect((await GET(request(), params())).status).toBe(401);
    expect(m.user).not.toHaveBeenCalled();
  });
  it("returns permanent free Pro and never makes purchases ready", async () => {
    const response = await GET(request(), params());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      kind: "legacy",
      pro: true,
      endsAt: null,
      renewing: false,
      purchasesReady: false,
    });
    expect(m.user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
  });
  it("keeps tariff enforcement disabled for accounts without a grant", async () => {
    m.user.mockResolvedValue({ locked: false, hideBranding: false, studioProGrant: null });
    expect(await (await GET(request(), params())).json()).toMatchObject({
      kind: "disabled",
      purchasesReady: false,
    });
  });
  it("does not restore access to locked accounts", async () => {
    m.user.mockResolvedValue({ locked: true, studioProGrant: { userId: 7 } });
    expect((await GET(request(), params())).status).toBe(401);
  });
  it("does not expose database failures", async () => {
    m.user.mockRejectedValue(new Error("private database detail"));
    const response = await GET(request(), params());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
  it.each(["purchase", "selection"])("does not enable %s", async (action) => {
    expect((await POST(request(), params(action))).status).toBe(404);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("honors the request guard before changing branding", async () => {
    m.guard.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(request({ hidden: true }), params("branding"))).status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("requires a permanent grant for this branding endpoint", async () => {
    m.user.mockResolvedValue({ locked: false, hideBranding: false, studioProGrant: null });
    expect((await POST(request({ hidden: true }), params("branding"))).status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("only updates the authenticated owner's branding", async () => {
    const response = await POST(request({ hidden: true }), params("branding"));
    expect(response.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { hideBranding: true },
      select: { hideBranding: true },
    });
    expect(await response.json()).toMatchObject({ kind: "legacy", hideBranding: true });
  });
  it("rejects attempts to assign another account or a grant", async () => {
    expect(
      (await POST(request({ hidden: true, userId: 8, grandfathered: true }), params("branding"))).status
    ).toBe(400);
    expect(m.update).not.toHaveBeenCalled();
  });
});
