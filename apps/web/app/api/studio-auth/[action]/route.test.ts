import { ErrorWithCode } from "@calcom/lib/errors";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  limit: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  exchange: vi.fn(),
  onboard: vi.fn(),
  unlink: vi.fn(),
  cancel: vi.fn(),
  methods: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@calcom/features/auth/lib/studioAccountSecurity", async (original) => ({
  ...(await original<typeof import("@calcom/features/auth/lib/studioAccountSecurity")>()),
  studioAccountRateLimit: m.limit,
}));
vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("@calcom/features/users/lib/deleteUser", () => ({ deleteUser: m.remove }));
vi.mock("@calcom/lib/constants", async original => ({ ...await original<typeof import("@calcom/lib/constants")>(), WEBAPP_URL: "https://fixmit.com" }));
vi.mock("@lib/studioSocial/session", () => ({ actor: m.actor }));
vi.mock("@lib/studioSocial/provider", () => ({
  startProvider: m.start,
  finishProvider: m.finish,
  options: () => ({ google: true, apple: true, googleScheme: "public-app-scheme" }),
}));
vi.mock("@lib/studioSocial/account", async (original) => ({
  ...(await original<typeof import("@lib/studioSocial/account")>()),
  exchangeIdentity: m.exchange,
  onboardSocial: m.onboard,
  unlink: m.unlink,
  cancelIdentity: m.cancel,
  methods: m.methods,
}));

import { GET, POST } from "./route";

const ctx = (action: string) => ({ params: Promise.resolve({ action }) });
const req = (body: unknown, origin = "https://fixmit.com") =>
  new NextRequest("https://fixmit.com/api/studio-auth/start", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.limit.mockResolvedValue(true);
  m.actor.mockResolvedValue({ user: { id: 9, email: "owner@example.invalid", metadata: {} }, token: {} });
  m.start.mockResolvedValue({ state: "f".repeat(64) });
  m.exchange.mockResolvedValue(NextResponse.json({ status: "signed_in" }));
});
describe("native authentication API guards", () => {
  it("exposes only public provider configuration", async () => {
    const response = await GET(req({}), ctx("options"));
    expect(await response.json()).toEqual({ google: true, apple: true, googleScheme: "public-app-scheme" });
    expect(m.actor).not.toHaveBeenCalled();
  });
  it("rejects cross-site mutation requests", async () => {
    expect(
      (
        await POST(
          req({ provider: "google", challenge: "a".repeat(43) }, "https://other.invalid"),
          ctx("start")
        )
      ).status
    ).toBe(403);
    expect(m.start).not.toHaveBeenCalled();
  });
  it("does not let a caller inject an actor account", async () => {
    expect(
      (await POST(req({ provider: "google", challenge: "a".repeat(43), actor: 1 }), ctx("start"))).status
    ).toBe(400);
    expect(m.start).not.toHaveBeenCalled();
  });
  it("allows anonymous sign-in but requires recent authentication for linking", async () => {
    await POST(req({ provider: "google", challenge: "a".repeat(43) }), ctx("start"));
    expect(m.actor).not.toHaveBeenCalled();
    await POST(req({ provider: "google", challenge: "a".repeat(43), mode: "link" }), ctx("start"));
    expect(m.actor).toHaveBeenCalledWith(expect.anything(), true);
    expect(m.start).toHaveBeenLastCalledWith("google", "a".repeat(43), "link", 9);
  });
  it("rejects unauthenticated account linking before contacting a provider", async () => {
    m.actor.mockRejectedValue(ErrorWithCode.Factory.Unauthorized("signin_required"));
    expect(
      (await POST(req({ provider: "apple", challenge: "a".repeat(43), mode: "link" }), ctx("start"))).status
    ).toBe(401);
    expect(m.start).not.toHaveBeenCalled();
  });
  it("requires fresh provider reauthentication before deletion", async () => {
    expect((await POST(req({}), ctx("delete"))).status).toBe(409);
    expect(m.actor).toHaveBeenCalledWith(expect.anything(), true);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("never accepts a body-selected deletion target", async () => {
    expect((await POST(req({ userId: 1 }), ctx("delete"))).status).toBe(400);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("caps request size and rate", async () => {
    expect((await POST(req("x".repeat(33000)), ctx("start"))).status).toBe(400);
    m.limit.mockResolvedValue(false);
    expect((await POST(req({}), ctx("start"))).status).toBe(429);
  });
  it("does not treat an ordinary social sign-in as deletion reauthentication", async () => {
    m.actor.mockResolvedValue({
      user: { id: 9 },
      token: {
        studioSocial: { provider: "google", sub: "owner", mfa: false },
        studioAuthenticatedAt: Math.floor(Date.now() / 1000),
      },
    });
    expect((await POST(req({}), ctx("delete"))).status).toBe(409);
    expect(m.remove).not.toHaveBeenCalled();
  });
});
