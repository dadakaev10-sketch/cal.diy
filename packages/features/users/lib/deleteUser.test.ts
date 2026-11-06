import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stripe: vi.fn(),
  avatar: vi.fn(),
  user: vi.fn(),
  studios: vi.fn(),
  deleteStudios: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@calcom/app-store/stripepayment/lib/customer", () => ({ deleteStripeCustomer: mocks.stripe }));
vi.mock("@calcom/prisma", () => ({ default: { $transaction: mocks.transaction } }));

import { deleteUser } from "./deleteUser";

describe("account deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.stripe.mockResolvedValue(null);
    mocks.studios.mockResolvedValue([{ id: 9 }]);
    mocks.transaction.mockImplementation(async (fn) =>
      fn({
        team: { findMany: mocks.studios, deleteMany: mocks.deleteStudios },
        avatar: { deleteMany: mocks.avatar },
        user: { delete: mocks.user },
      })
    );
  });
  it("removes only the authenticated user's avatars and account in a transaction", async () => {
    await deleteUser({ id: 42, email: "test@example.invalid", metadata: {} });
    expect(mocks.avatar).toHaveBeenCalledWith({ where: { OR: [{ userId: 42 }, { teamId: { in: [9] } }] } });
    expect(mocks.studios).toHaveBeenCalledWith({
      where: {
        metadata: { path: ["studioPlatform"], equals: true },
        members: { some: { userId: 42, role: "OWNER" }, every: { userId: 42 } },
      },
      select: { id: true },
    });
    expect(mocks.deleteStudios).toHaveBeenCalledWith({ where: { id: { in: [9] } } });
    expect(mocks.user).toHaveBeenCalledWith({ where: { id: 42 } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.avatar.mock.invocationCallOrder[0]).toBeLessThan(mocks.user.mock.invocationCallOrder[0]);
  });
  it("does not delete the account when avatar cleanup fails", async () => {
    mocks.avatar.mockRejectedValue(new Error("database unavailable"));
    await expect(deleteUser({ id: 42, email: "test@example.invalid", metadata: {} })).rejects.toThrow(
      "database unavailable"
    );
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
