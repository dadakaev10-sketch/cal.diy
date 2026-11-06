import { deleteStripeCustomer } from "@calcom/app-store/stripepayment/lib/customer";
import prisma from "@calcom/prisma";
import type { User } from "@calcom/prisma/client";

export async function deleteUser(user: Pick<User, "id" | "email" | "metadata">) {
  // If 2FA is disabled or totpCode is valid then delete the user from stripe and database
  await deleteStripeCustomer(user).catch(console.warn);
  // Remove my account
  // TODO: Move this to Repository pattern.
  await prisma.$transaction(async (tx) => {
    // Avatars have no user foreign key and must be removed explicitly.
    await tx.avatar.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
  });
}
