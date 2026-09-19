import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { TeamAccessService } from "./TeamAccessService";

describe("TeamAccessService", () => {
  const service = new TeamAccessService(prismaMock);
  const membership = {
    id: 1,
    userId: 10,
    teamId: 100,
    role: MembershipRole.MEMBER,
    accepted: true,
    customRoleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prismaMock.membership.findUnique.mockReset();
  });

  it("allows an accepted membership and scopes the lookup to both IDs", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(membership);
    await expect(service.requireMembership(10, 100)).resolves.toMatchObject({ teamId: 100 });
    expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
      where: { userId_teamId: { userId: 10, teamId: 100 } },
      select: { id: true, userId: true, teamId: true, accepted: true, role: true },
    });
  });

  it("denies another business without a membership", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);
    await expect(service.requireMembership(10, 200)).rejects.toMatchObject({ code: ErrorCode.Forbidden });
  });

  it("denies an unaccepted owner invitation", async () => {
    prismaMock.membership.findUnique.mockResolvedValue({
      ...membership,
      role: MembershipRole.OWNER,
      accepted: false,
    });
    await expect(service.requireMembership(10, 100)).rejects.toMatchObject({ code: ErrorCode.Forbidden });
  });

  it("does not let a staff member perform owner actions", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(membership);
    await expect(service.requireMembership(10, 100, [MembershipRole.OWNER])).rejects.toMatchObject({
      code: ErrorCode.Forbidden,
    });
  });

  it("allows an accepted owner for owner actions", async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ ...membership, role: MembershipRole.OWNER });
    await expect(service.requireMembership(10, 100, [MembershipRole.OWNER])).resolves.toMatchObject({
      role: MembershipRole.OWNER,
    });
  });

  it("fails closed for an empty allowed-role list", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(membership);
    await expect(service.requireMembership(10, 100, [])).rejects.toMatchObject({ code: ErrorCode.Forbidden });
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid identity %s without a query", async (id) => {
    await expect(service.requireMembership(id, 100)).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    await expect(service.requireMembership(10, id)).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
  });

  it("propagates database failure instead of granting access", async () => {
    prismaMock.membership.findUnique.mockRejectedValue(new Error("Database unavailable"));
    await expect(service.requireMembership(10, 100)).rejects.toThrow("Database unavailable");
  });
});
