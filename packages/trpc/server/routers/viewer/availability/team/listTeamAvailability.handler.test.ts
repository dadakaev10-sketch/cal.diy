import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listTeamAvailabilityHandler } from "./listTeamAvailability.handler";
import { ZListTeamAvailaiblityScheme } from "./listTeamAvailability.schema";

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {
    async enrichUsersWithTheirProfileExcludingOrgMetadata() {
      return [];
    }
  },
}));

describe("team availability authorization", () => {
  const ctx = { user: { id: 10, organizationId: null } };
  const input = {
    limit: 10,
    startDate: "2026-09-20",
    endDate: "2026-09-21",
    loggedInUsersTz: "UTC",
    teamId: 100,
  };
  const membership = {
    id: 1,
    userId: 10,
    teamId: 100,
    accepted: true,
    role: MembershipRole.MEMBER,
    customRoleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.membership.findMany.mockResolvedValue([]);
    prismaMock.membership.count.mockResolvedValue(0);
    prismaMock.membership.findFirst.mockResolvedValue(null);
  });

  it.each([
    null,
    { ...membership, accepted: false },
  ])("denies absent or pending membership before reading any availability", async (record) => {
    prismaMock.membership.findUnique.mockResolvedValue(record);
    await expect(listTeamAvailabilityHandler({ ctx, input })).rejects.toMatchObject({
      code: ErrorCode.Forbidden,
    });
    expect(prismaMock.membership.findMany).not.toHaveBeenCalled();
    expect(prismaMock.membership.count).not.toHaveBeenCalled();
    expect(prismaMock.schedule.findUnique).not.toHaveBeenCalled();
  });

  it("only lists and counts accepted members of the requested team", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(membership);
    const result = await listTeamAvailabilityHandler({ ctx, input });
    expect(result.rows).toEqual([]);
    expect(prismaMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: { in: [100] }, accepted: true } })
    );
    expect(prismaMock.membership.count).toHaveBeenCalledWith({ where: { teamId: 100, accepted: true } });
  });

  it("does not infer access from a legacy organization ID", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);
    await expect(
      listTeamAvailabilityHandler({
        ctx: { user: { id: 10, organizationId: 200 } },
        input: { ...input, teamId: undefined },
      })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
  });

  it("restricts the all-teams lookup to accepted memberships", async () => {
    await expect(
      listTeamAvailabilityHandler({ ctx, input: { ...input, teamId: undefined } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prismaMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 10, accepted: true } })
    );
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])("rejects invalid team ID %s at the API boundary", (teamId) => {
    expect(ZListTeamAvailaiblityScheme.safeParse({ ...input, teamId }).success).toBe(false);
  });
});
