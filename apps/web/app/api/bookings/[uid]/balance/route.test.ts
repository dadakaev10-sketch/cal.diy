import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), balance: vi.fn() }));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: m.session }));
vi.mock("@calcom/app-store/stripepayment/lib/bookingBalance", () => ({ bookingBalance: m.balance }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({}) }));
vi.mock("@calcom/lib/constants", () => ({ WEBAPP_URL: "https://fixmit.com" }));

import { GET, POST } from "./route";

const ctx = { params: Promise.resolve({ uid: "test-booking" }) };
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ user: { id: 42 } });
  m.balance.mockResolvedValue(null);
});
describe("balance endpoint authorization", () => {
  it("requires authentication for reads and writes", async () => {
    m.session.mockResolvedValue(null);
    expect((await GET(new Request("https://fixmit.com/api/bookings/test-booking/balance"), ctx)).status).toBe(
      401
    );
    expect(
      (
        await POST(
          new Request("https://fixmit.com/api/bookings/test-booking/balance", { method: "POST" }),
          ctx
        )
      ).status
    ).toBe(401);
    expect(m.balance).not.toHaveBeenCalled();
  });
  it("rejects cross-origin studio payment writes", async () => {
    const res = await POST(
      new Request("https://fixmit.com/api/bookings/test-booking/balance", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: JSON.stringify({ action: "studio" }),
      }),
      ctx
    );
    expect(res.status).toBe(403);
    expect(m.balance).not.toHaveBeenCalled();
  });
  it("uses the session owner and accepts only supported actions", async () => {
    const res = await POST(
      new Request("https://fixmit.com/api/bookings/test-booking/balance", {
        method: "POST",
        headers: { Origin: "https://fixmit.com" },
        body: JSON.stringify({ action: "link", userId: 99 }),
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(m.balance).toHaveBeenCalledWith("test-booking", 42, "link");
  });
  it("rejects arbitrary settlement actions", async () => {
    const res = await POST(
      new Request("https://fixmit.com/api/bookings/test-booking/balance", {
        method: "POST",
        headers: { Origin: "https://fixmit.com" },
        body: JSON.stringify({ action: "refund" }),
      }),
      ctx
    );
    expect(res.status).toBe(409);
    expect(m.balance).not.toHaveBeenCalled();
  });
});
