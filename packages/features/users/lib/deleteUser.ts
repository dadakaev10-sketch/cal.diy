import { deleteStripeCustomer } from "@calcom/app-store/stripepayment/lib/customer";
import { revokeUserAppleAccounts } from "@calcom/features/auth/lib/studioApple";
import prisma from "@calcom/prisma";
import type { User } from "@calcom/prisma/client";

export async function deleteUser(user: Pick<User, "id" | "email" | "metadata">) {
  await revokeUserAppleAccounts(user.id);
  // If 2FA is disabled or totpCode is valid then delete the user from stripe and database
  await deleteStripeCustomer(user).catch(console.warn);
  await prisma.$transaction(
    async (tx) => {
      // Registration creates a separate studio record; retain studios shared with other members.
      const studios = await tx.team.findMany({
        where: {
          metadata: { path: ["studioPlatform"], equals: true },
          members: { some: { userId: user.id, role: "OWNER" }, every: { userId: user.id } },
        },
        select: { id: true },
      });
      const studioIds = studios.map((studio) => studio.id);
      // Avatars have no foreign keys and must be removed explicitly.
      await tx.avatar.deleteMany({ where: { OR: [{ userId: user.id }, { teamId: { in: studioIds } }] } });
      await tx.team.deleteMany({ where: { id: { in: studioIds } } });
      await tx.user.delete({ where: { id: user.id } });
    },
    { isolationLevel: "Serializable" }
  );
}
