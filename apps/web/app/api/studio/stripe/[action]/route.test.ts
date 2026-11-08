import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  status: vi.fn(),
  event: vi.fn(),
}));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: m.session }));
vi.mock("@calcom/features/auth/lib/studioAccountSecurity", async (original) => ({
  ...(await original<typeof import("@calcom/features/auth/lib/studioAccountSecurity")>()),
  studioAccountRateLimit: m.limit,
}));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("@calcom/prisma", () => ({ default: { eventType: { findFirst: m.event } } }));
vi.mock("@calcom/app-store/stripepayment/lib/studioRestrictedStripe", async (original) => ({
  ...(await original<typeof import("@calcom/app-store/stripepayment/lib/studioRestrictedStripe")>()),
  connectRestrictedStripe: m.connect,
  disconnectRestrictedStripe: m.disconnect,
}));
vi.mock("@calcom/app-store/stripepayment/lib/studioConnection", () => ({ studioStripeStatus: m.status }));

import { GET, POST } from "./route";

const input = { apiKey: "rk_test_abcdefghijklmnop", publishableKey: "pk_test_abcdefghijklmnop" };
function request(body: unknown = input, origin = "https://fixmit.com", contentType = "application/json") {
  return new NextRequest("https://fixmit.com/api/studio/stripe/connect", {
    method: "POST",
    headers: { origin, "content-type": contentType },
    body: JSON.stringify(body),
  });
}
const params = (action = "connect") => ({ params: Promise.resolve({ action }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WEBAPP_URL", "https://fixmit.com");
  vi.stubEnv("NEXTAUTH_URL", "https://fixmit.com");
  m.session.mockResolvedValue({ user: { id: 7 } });
  m.limit.mockResolvedValue(true);
  m.connect.mockResolvedValue({ connected: true });
  m.status.mockResolvedValue({ connected: false });
});
afterEach(() => vi.unstubAllEnvs());
describe("authenticated Stripe key management", () => {
  it("requires a signed-in owner", async () => {
    m.session.mockResolvedValue(null);
    expect((await POST(request(), params())).status).toBe(401);
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests", async () => {
    expect((await POST(request(input, "https://attacker.invalid"), params())).status).toBe(403);
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("requires JSON and enforces request limits", async () => {
    expect((await POST(request(input, "https://fixmit.com", "text/plain"), params())).status).toBe(415);
    expect((await POST(request({ apiKey: "x".repeat(17000) }), params())).status).toBe(400);
  });
  it("binds the key to the session, not a supplied owner", async () => {
    expect((await POST(request({ ...input, userId: 99 }), params())).status).toBe(400);
    expect((await POST(request(), params())).status).toBe(200);
    expect(m.connect).toHaveBeenCalledWith(7, input);
  });
  it("rate limits key checks", async () => {
    m.limit.mockResolvedValue(false);
    expect((await POST(request(), params())).status).toBe(429);
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("never echoes keys or Stripe exceptions", async () => {
    m.connect.mockRejectedValue(new Error("rk_test_private whsec_private"));
    const reply = await POST(request(), params());
    expect(reply.status).toBe(503);
    expect(await reply.text()).not.toMatch(/rk_test|whsec_/);
  });
  it("requires explicit disconnect confirmation", async () => {
    expect((await POST(request({}), params("disconnect"))).status).toBe(400);
    await POST(request({ confirm: true }), params("disconnect"));
    expect(m.disconnect).toHaveBeenCalledWith(7);
  });
  it("restricts service revisions to the authenticated studio", async () => {
    m.event.mockResolvedValue(null);
    expect(
      (await GET(new NextRequest("https://fixmit.com/api/studio/stripe/service?id=33"), params("service")))
        .status
    ).toBe(404);
    expect(m.event).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 33, userId: 7 } }));
  });
  it("has no OAuth callback or Connect start action", async () => {
    expect((await POST(request(), params("start"))).status).toBe(404);
  });
});
