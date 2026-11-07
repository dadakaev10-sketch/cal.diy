import prisma from "@calcom/prisma";
import { z } from "zod";
import { validAppleAccount } from "./studioApple";
import { socialAccountProvider, socialProvider } from "./studioSocialIdentity";
export const socialSessionClaim = z.object({ provider: socialProvider, sub: z.string(), mfa: z.boolean() });
export async function validSocialSession(userId: number, claim: unknown, twoFactorEnabled: boolean) {
  if (claim === undefined) return true;
  const parsed = socialSessionClaim.safeParse(claim);
  if (!parsed.success) return false;
  if (twoFactorEnabled && !parsed.data.mfa) return false;
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: socialAccountProvider(parsed.data.provider),
        providerAccountId: parsed.data.sub,
      },
    },
    select: { id: true, userId: true, refresh_token: true, expires_at: true },
  });
  if (!account || account.userId !== userId) return false;
  return parsed.data.provider !== "apple" || (await validAppleAccount(account));
}
