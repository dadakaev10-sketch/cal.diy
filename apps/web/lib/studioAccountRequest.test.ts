import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), user: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("@calcom/prisma", () => ({
  default: { user: { findUnique: mocks.user }, $queryRaw: mocks.query, $executeRaw: mocks.execute },
}));

import { studioPasswordStamp } from "@calcom/features/auth/lib/studioAccountSecurity";
import { guardStudioAccountRequest, readStudioAccountBody } from "./studioAccountRequest";
import { getStudioAdmin } from "./studioAdmin";

const request = (body = "{}", origin = "https://test.local") =>
  new NextRequest("https://test.local/api/studio-registration/admin", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXTAUTH_URL", "https://test.local");
  vi.stubEnv("NEXTAUTH_SECRET", "secret");
  mocks.query.mockResolvedValue([{ attempts: 1 }]);
});
describe("studio account HTTP boundary", () => {
  it("rejects cross-origin requests before touching the database", async () => {
    expect((await guardStudioAccountRequest(request("{}", "https://evil.local"), "test"))?.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("limits attempts before parsing user data", async () => {
    mocks.query.mockResolvedValue([{ attempts: 21 }]);
    const response = await guardStudioAccountRequest(request(), "test");
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("600");
  });
  it("rejects malformed and oversized bodies", async () => {
    expect(await readStudioAccountBody(request("{broken"))).toBeUndefined();
    expect(
      await readStudioAccountBody(request(JSON.stringify({ data: "a".repeat(17_000) })))
    ).toBeUndefined();
    expect(await readStudioAccountBody(request('{"email":"a@example.com"}'))).toEqual({
      email: "a@example.com",
    });
  });
  it.each([
    null,
    { sub: "1", role: "USER" },
    { sub: "1", role: "INACTIVE_ADMIN" },
  ])("rejects non-administrators", async (token) => {
    mocks.token.mockResolvedValue(token);
    expect(await getStudioAdmin(request())).toBeNull();
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("requires a current password stamp, database role and two-factor authentication", async () => {
    const stamp = studioPasswordStamp("hash", "secret");
    mocks.token.mockResolvedValue({ sub: "1", role: "ADMIN", studioPasswordStamp: stamp });
    mocks.user.mockResolvedValue({
      id: 1,
      role: "ADMIN",
      twoFactorEnabled: true,
      locked: false,
      password: { hash: "hash" },
    });
    expect(await getStudioAdmin(request())).toBe(1);
    mocks.user.mockResolvedValue({
      id: 1,
      role: "USER",
      twoFactorEnabled: true,
      locked: false,
      password: { hash: "hash" },
    });
    expect(await getStudioAdmin(request())).toBeNull();
    mocks.user.mockResolvedValue({
      id: 1,
      role: "ADMIN",
      twoFactorEnabled: false,
      locked: false,
      password: { hash: "hash" },
    });
    expect(await getStudioAdmin(request())).toBeNull();
    mocks.user.mockResolvedValue({
      id: 1,
      role: "ADMIN",
      twoFactorEnabled: true,
      locked: false,
      password: { hash: "new hash" },
    });
    expect(await getStudioAdmin(request())).toBeNull();
  });
});
