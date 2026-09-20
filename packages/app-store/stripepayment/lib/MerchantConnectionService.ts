import { randomUUID } from "node:crypto";
import { TeamAccessService } from "@calcom/features/teams/services/TeamAccessService";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import Stripe from "stripe";
import { z } from "zod";
import { encryptMerchantStripeCredentials } from "./merchantCredentials";

const inputSchema = z
  .object({
    accountId: z
      .string()
      .regex(/^acct_[a-zA-Z0-9]+$/)
      .max(255),
    publishableKey: z
      .string()
      .regex(/^pk_test_[a-zA-Z0-9]+$/)
      .max(255),
    restrictedKey: z
      .string()
      .regex(/^rk_test_[a-zA-Z0-9]+$/)
      .max(255),
    webhookSecret: z
      .string()
      .regex(/^whsec_[a-zA-Z0-9]+$/)
      .max(255)
      .optional(),
  })
  .strict();

export type MerchantConnectionInput = z.infer<typeof inputSchema>;

const publicSelect = { id: true, accountId: true, verifiedAt: true, revision: true } as const;

export async function verifyMerchantStripeAccount(input: MerchantConnectionInput): Promise<void> {
  try {
    const stripe = new Stripe(input.restrictedKey, {
      apiVersion: "2020-08-27",
      timeout: 10000,
      maxNetworkRetries: 0,
    });
    // With no account header or ID, Stripe returns the account owning this restricted key.
    const [account, balance] = await Promise.all([stripe.accounts.retrieve(), stripe.balance.retrieve()]);
    if (account.id !== input.accountId || balance.livemode) {
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_verification_failed");
    }
  } catch {
    throw ErrorWithCode.Factory.BadRequest("merchant_stripe_verification_failed");
  }
}

export class MerchantConnectionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly encryptionKey: string,
    private readonly verify: typeof verifyMerchantStripeAccount = verifyMerchantStripeAccount
  ) {}

  async status(userId: number, teamId: number) {
    await new TeamAccessService(this.db).requireMembership(userId, teamId, [MembershipRole.OWNER]);
    return this.db.merchantStripeConnection.findUnique({ where: { teamId }, select: publicSelect });
  }

  async save(userId: number, teamId: number, input: unknown) {
    await new TeamAccessService(this.db).requireMembership(userId, teamId, [MembershipRole.OWNER]);
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw ErrorWithCode.Factory.BadRequest("merchant_stripe_invalid_keys");
    // Validate encryption setup before sending customer credentials to Stripe.
    const newId = randomUUID();
    encryptMerchantStripeCredentials(
      { teamId, connectionId: newId },
      { ...parsed.data, mode: "test" },
      this.encryptionKey
    );
    await this.verify(parsed.data);
    return this.db.$transaction(
      async (tx) => {
        await new TeamAccessService(tx).requireMembership(userId, teamId, [MembershipRole.OWNER]);
        const existing = await tx.merchantStripeConnection.findUnique({
          where: { teamId },
          select: publicSelect,
        });
        if (existing && existing.accountId !== parsed.data.accountId) {
          throw ErrorWithCode.Factory.BadRequest("merchant_stripe_account_locked");
        }
        const id = existing?.id ?? newId;
        const encryptedCredentials = encryptMerchantStripeCredentials(
          { teamId, connectionId: id },
          { ...parsed.data, mode: "test" },
          this.encryptionKey
        );
        const data = { encryptedCredentials, verifiedAt: new Date(), updatedByUserId: userId };
        return tx.merchantStripeConnection.upsert({
          where: { teamId },
          create: { id, teamId, accountId: parsed.data.accountId, ...data },
          update: { ...data, revision: { increment: 1 } },
          select: publicSelect,
        });
      },
      { isolationLevel: "Serializable" }
    );
  }
}
