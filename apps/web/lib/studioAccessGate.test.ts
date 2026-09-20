import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), user: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("@calcom/prisma", () => ({
  default: { user: { findUnique: mocks.user }, $queryRaw: mocks.query, $executeRaw: mocks.execute },
}));

import { studioAccessGate, studioRouteAccess } from "./studioAccessGate";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STUDIO_ACCESS_GATE_ENABLED", "true");
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  mocks.token.mockResolvedValue(null);
  mocks.query.mockResolvedValue([{ attempts: 1 }]);
});

describe("studio access boundary", () => {
  it.each([
    "/",
    "/auth/login",
    "/register",
    "/icons/sprite.svg",
    "/_next/static/a.js",
    "/api/auth/session",
  ])("permits public GET %s", (path) => {
    expect(studioRouteAccess(path, "GET")).toBe("public");
  });
  it.each([
    "/api/auth/setup",
    "/auth/setup/",
    "/api/auth/signup",
  ])("closes bootstrap and upstream signup %s", async (path) => {
    expect((await studioAccessGate(new NextRequest(`https://test.local${path}`)))?.status).toBe(404);
  });
  it.each([
    "/event-types",
    "/settings/my-account/studio-payments",
    "/teams",
  ])("redirects anonymous page %s to app login", async (path) => {
    const result = await studioAccessGate(new NextRequest(`https://test.local${path}`));
    expect(result?.status).toBe(307);
    expect(new URL(result?.headers.get("location") || "").pathname).toBe("/auth/login");
    expect(result?.headers.has("www-authenticate")).toBe(false);
  });
  it.each([
    "/api/trpc/viewer.me",
    "/api/stripe/studio-test/abc",
  ])("returns JSON instead of browser challenge for %s", async (path) => {
    const result = await studioAccessGate(new NextRequest(`https://test.local${path}`));
    expect(result?.status).toBe(401);
    expect(result?.headers.has("www-authenticate")).toBe(false);
  });
  it("does not allow server actions through the public homepage", async () => {
    expect((await studioAccessGate(new NextRequest("https://test.local/", { method: "POST" })))?.status).toBe(
      401
    );
  });
  it("accepts only existing unlocked users", async () => {
    mocks.token.mockResolvedValue({ sub: "7" });
    mocks.user.mockResolvedValue({ id: 7, locked: false });
    expect(await studioAccessGate(new NextRequest("https://test.local/event-types"))).toBeNull();
    mocks.user.mockResolvedValue({ id: 7, locked: true });
    expect((await studioAccessGate(new NextRequest("https://test.local/event-types")))?.status).toBe(307);
    mocks.user.mockResolvedValue(null);
    expect((await studioAccessGate(new NextRequest("https://test.local/event-types")))?.status).toBe(307);
  });
  it("rejects non-user tokens", async () => {
    mocks.token.mockResolvedValue({ sub: "not-a-user" });
    expect((await studioAccessGate(new NextRequest("https://test.local/api/private")))?.status).toBe(401);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("throttles credentials attempts durably", async () => {
    mocks.query.mockResolvedValue([{ attempts: 21 }]);
    const result = await studioAccessGate(
      new NextRequest("https://test.local/api/auth/callback/credentials/", { method: "POST" })
    );
    expect(result?.status).toBe(429);
    expect(result?.headers.get("retry-after")).toBe("600");
  });
  it("fails closed when the throttle is unavailable", async () => {
    mocks.query.mockRejectedValue(new Error("database unavailable"));
    expect(
      (
        await studioAccessGate(
          new NextRequest("https://test.local/api/auth/callback/credentials", { method: "POST" })
        )
      )?.status
    ).toBe(503);
  });
  it("fails closed without the authentication secret", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect((await studioAccessGate(new NextRequest("https://test.local/auth/login")))?.status).toBe(503);
  });
});
