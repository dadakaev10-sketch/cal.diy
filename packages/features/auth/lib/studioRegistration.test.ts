import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  existing: vi.fn(),
  request: vi.fn(),
  createRequest: vi.fn(),
  remove: vi.fn(),
  team: vi.fn(),
  createUser: vi.fn(),
  createTeam: vi.fn(),
  schedule: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({
  default: {
    user: { findUnique: mocks.existing },
    studioRegistrationRequest: { create: mocks.createRequest, deleteMany: mocks.remove },
    $queryRaw: mocks.query,
    $executeRaw: mocks.execute,
    $transaction: mocks.transaction,
  },
}));
vi.mock("@calcom/emails/templates/account-verify-email", () => ({
  default: class {
    sendEmail = mocks.send;
  },
}));
vi.mock("@calcom/i18n/server", () => ({ getTranslation: vi.fn().mockResolvedValue(() => "text") }));
vi.mock("@calcom/lib/auth/hashPassword", () => ({ hashPassword: vi.fn().mockResolvedValue("hash") }));

import {
  completeStudioRegistration,
  requestStudioRegistration,
  studioRegistrationSchema,
} from "./studioRegistration";

const input = {
  token: "b".repeat(64),
  name: "Owner",
  studioName: "Studio",
  slug: "my-studio",
  timeZone: "Europe/Vienna",
  password: "Long-Password-12345",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXTAUTH_SECRET", "secret");
  vi.stubEnv("NEXTAUTH_URL", "https://test.local");
  mocks.query.mockResolvedValue([{ attempts: 1 }]);
  mocks.existing.mockResolvedValue(null);
  mocks.user.mockResolvedValue(null);
  mocks.team.mockResolvedValue(null);
  mocks.request.mockResolvedValue({
    tokenHash: "hash",
    email: "verified@example.com",
    locale: "de",
    studioName: null,
    createdBy: null,
  });
  mocks.remove.mockResolvedValue({ count: 1 });
  mocks.createUser.mockResolvedValue({ id: 17 });
  mocks.schedule.mockResolvedValue({ id: 23 });
  mocks.transaction.mockImplementation(async (fn) =>
    fn({
      studioRegistrationRequest: { findFirst: mocks.request, deleteMany: mocks.remove },
      user: { findFirst: mocks.user, create: mocks.createUser, update: mocks.update },
      team: { findFirst: mocks.team, create: mocks.createTeam },
      schedule: { create: mocks.schedule },
      $executeRaw: mocks.execute,
    })
  );
});

describe("email-first studio provisioning", () => {
  it("does not create a user or accept a password before verification", async () => {
    await requestStudioRegistration({ email: "new@example.com", locale: "de" });
    expect(mocks.createRequest).toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith({ throwOnError: true });
  });
  it("returns neutrally for an existing account without modifying it", async () => {
    mocks.existing.mockResolvedValue({ id: 1 });
    await expect(
      requestStudioRegistration({ email: "existing@example.com", locale: "en" })
    ).resolves.toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });
  it("creates exactly one verified ordinary user and isolated owner membership", async () => {
    expect(await completeStudioRegistration(input)).toBe("studio_registration_complete");
    expect(mocks.createUser.mock.calls[0][0].data).toMatchObject({
      email: "verified@example.com",
      role: "USER",
      emailVerified: expect.any(Date),
      locked: false,
    });
    expect(mocks.createTeam.mock.calls[0][0].data).toMatchObject({
      isOrganization: false,
      members: { create: { userId: 17, role: "OWNER", accepted: true } },
    });
    expect(mocks.schedule.mock.calls[0][0].data).not.toHaveProperty("availability");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { defaultScheduleId: 23 },
      select: { id: true },
    });
  });
  it("uses the verified email and administrator-defined studio name", async () => {
    mocks.request.mockResolvedValue({
      tokenHash: "hash",
      email: "verified@example.com",
      locale: "de",
      studioName: "Invited Studio",
      createdBy: 9,
    });
    await completeStudioRegistration({ ...input, studioName: "Tampered" });
    expect(mocks.createTeam.mock.calls[0][0].data.name).toBe("Invited Studio");
    expect(mocks.createTeam.mock.calls[0][0].data.metadata.provisionedBy).toBe(9);
  });
  it("rejects an expired token without provisioning", async () => {
    mocks.request.mockResolvedValue(null);
    expect(await completeStudioRegistration(input)).toBe("request_is_expired");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("rejects a concurrent token claim without provisioning", async () => {
    mocks.remove.mockResolvedValue({ count: 0 });
    expect(await completeStudioRegistration(input)).toBe("request_is_expired");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("rejects a taken studio slug", async () => {
    mocks.team.mockResolvedValue({ id: 9 });
    expect(await completeStudioRegistration(input)).toBe("studio_slug_unavailable");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("rejects reserved routes", async () => {
    expect(await completeStudioRegistration({ ...input, slug: "studio-admin" })).toBe(
      "studio_slug_unavailable"
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("leaves all writes in the transaction when provisioning fails", async () => {
    mocks.createTeam.mockRejectedValue(new Error("database failed"));
    await expect(completeStudioRegistration(input)).rejects.toThrow("database failed");
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
  it("rejects untrusted slugs and unknown time zones", () => {
    expect(studioRegistrationSchema.safeParse({ ...input, slug: "../admin" }).success).toBe(false);
    expect(studioRegistrationSchema.safeParse({ ...input, timeZone: "Invalid/Zone" }).success).toBe(false);
  });
});
