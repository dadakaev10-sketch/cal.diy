import prisma from "@calcom/testing/lib/__mocks__/prismaMock";
import { MembershipRole } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantConnectionService, verifyMerchantStripeAccount } from "./MerchantConnectionService";
import { decryptMerchantStripeCredentials } from "./merchantCredentials";

const stripe = vi.hoisted(() => ({ account: vi.fn(), balance: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: stripe.account };
    balance = { retrieve: stripe.balance };
  },
}));

const key = "ab".repeat(32);
const input = {
  accountId: "acct_fixture",
  publishableKey: "pk_test_fixture",
  restrictedKey: "rk_test_fixture",
  webhookSecret: "whsec_fixture",
};
const owner = {
  id: 1,
  userId: 10,
  teamId: 100,
  role: MembershipRole.OWNER,
  accepted: true,
  customRoleId: null,
  createdAt: null,
  updatedAt: null,
};
const verify = vi.fn(async () => {});
const service = new MerchantConnectionService(prisma, key, verify);

beforeEach(() => {
  verify.mockClear();
  verify.mockResolvedValue(undefined);
  prisma.membership.findUnique.mockResolvedValue(owner);
  prisma.merchantStripeConnection.findUnique.mockResolvedValue(null);
  prisma.$transaction.mockImplementation(async (operation) => {
    if (typeof operation !== "function") throw new Error("Unexpected transaction");
    return operation(prisma);
  });
});

describe("merchant connection ownership and persistence", () => {
  it("allows initial setup without a webhook secret", async () => {
    await service.save(10, 100, { ...input, webhookSecret: undefined });
    expect(prisma.merchantStripeConnection.upsert).toHaveBeenCalledOnce();
  });
  it.each([
    null,
    { ...owner, accepted: false },
    { ...owner, role: MembershipRole.MEMBER },
    { ...owner, role: MembershipRole.ADMIN },
  ])("denies absent, pending or non-owner membership", async (membership) => {
    prisma.membership.findUnique.mockResolvedValue(membership);
    await expect(service.save(10, 100, input)).rejects.toMatchObject({ code: "forbidden_error" });
    expect(verify).not.toHaveBeenCalled();
    expect(prisma.merchantStripeConnection.upsert).not.toHaveBeenCalled();
  });

  it("reads status without selecting ciphertext", async () => {
    await service.status(10, 100);
    expect(prisma.merchantStripeConnection.findUnique).toHaveBeenCalledWith({
      where: { teamId: 100 },
      select: { id: true, accountId: true, verifiedAt: true, revision: true },
    });
  });

  it("encrypts before persistence and returns no key material", async () => {
    await service.save(10, 100, input);
    const args = prisma.merchantStripeConnection.upsert.mock.calls[0][0];
    expect(JSON.stringify(args)).not.toContain(input.restrictedKey);
    expect(JSON.stringify(args)).not.toContain(input.webhookSecret);
    expect(args.select).not.toHaveProperty("encryptedCredentials");
    expect(
      decryptMerchantStripeCredentials(
        { teamId: 100, connectionId: String(args.create.id) },
        args.create.encryptedCredentials,
        key
      )
    ).toEqual({ ...input, mode: "test" });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("does not save when Stripe verification fails", async () => {
    verify.mockRejectedValueOnce(new Error("verification failed"));
    await expect(service.save(10, 100, input)).rejects.toThrow();
    expect(prisma.merchantStripeConnection.upsert).not.toHaveBeenCalled();
  });

  it("rechecks ownership after remote verification", async () => {
    prisma.membership.findUnique.mockResolvedValueOnce(owner).mockResolvedValueOnce(null);
    await expect(service.save(10, 100, input)).rejects.toMatchObject({ code: "forbidden_error" });
    expect(prisma.merchantStripeConnection.upsert).not.toHaveBeenCalled();
  });

  it("rejects live keys before contacting Stripe", async () => {
    await expect(service.save(10, 100, { ...input, restrictedKey: "rk_live_fixture" })).rejects.toThrow(
      "invalid_keys"
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails before remote access if encryption is unconfigured", async () => {
    await expect(new MerchantConnectionService(prisma, "", verify).save(10, 100, input)).rejects.toThrow(
      "not configured"
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("prevents replacing an existing studio account", async () => {
    prisma.merchantStripeConnection.findUnique.mockResolvedValue({
      id: "60fe20f0-ded5-4d93-a75c-a1f4f85f08e7",
      teamId: 100,
      accountId: "acct_other",
      revision: 1,
      encryptedCredentials: {},
      verifiedAt: new Date(),
      updatedByUserId: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(service.save(10, 100, input)).rejects.toThrow("account_locked");
    expect(prisma.merchantStripeConnection.upsert).not.toHaveBeenCalled();
  });
});

describe("Stripe account verification", () => {
  beforeEach(() => {
    stripe.account.mockReset().mockResolvedValue({ id: input.accountId });
    stripe.balance.mockReset().mockResolvedValue({ livemode: false });
  });
  it("uses the key's own account without Connect account overrides", async () => {
    await expect(verifyMerchantStripeAccount(input)).resolves.toBeUndefined();
    expect(stripe.account).toHaveBeenCalledWith();
    expect(stripe.balance).toHaveBeenCalledWith();
  });
  it("rejects another account", async () => {
    stripe.account.mockResolvedValue({ id: "acct_other" });
    await expect(verifyMerchantStripeAccount(input)).rejects.toThrow("verification_failed");
  });
  it("rejects live mode", async () => {
    stripe.balance.mockResolvedValue({ livemode: true });
    await expect(verifyMerchantStripeAccount(input)).rejects.toThrow("verification_failed");
  });
  it("does not expose provider errors or keys", async () => {
    stripe.account.mockRejectedValue(new Error(`Invalid key ${input.restrictedKey}`));
    await expect(verifyMerchantStripeAccount(input)).rejects.toThrow("merchant_stripe_verification_failed");
  });
});
