import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma/client";
import type { MembershipRole } from "@calcom/prisma/enums";

export class TeamAccessService {
  constructor(private readonly db: Pick<PrismaClient, "membership">) {}

  async requireMembership(userId: number, teamId: number, allowedRoles?: readonly MembershipRole[]) {
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(teamId) || teamId <= 0) {
      throw ErrorWithCode.Factory.Forbidden("Team access denied");
    }

    const membership = await this.db.membership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { id: true, userId: true, teamId: true, accepted: true, role: true },
    });

    // An invitation is not authorization; even platform admins need an explicit membership here.
    if (!membership?.accepted || (allowedRoles && !allowedRoles.includes(membership.role))) {
      throw ErrorWithCode.Factory.Forbidden("Team access denied");
    }

    return membership;
  }
}
