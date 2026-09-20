import prisma from "@calcom/testing/lib/__mocks__/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestStudio, saveStudioStripe } from "./actions";

const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), refresh: vi.fn() }));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({ getServerSession: mocks.session }));
vi.mock("@lib/buildLegacyCtx", () => ({ buildLegacyRequest: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@calcom/app-store/stripepayment/lib/MerchantConnectionService", () => ({
  MerchantConnectionService: class {
    save = mocks.save;
  },
}));

function form() {
  const data = new FormData();
  data.set("teamId", "100");
  data.set("name", "Test Studio");
  data.set("accountId", "acct_fixture");
  data.set("publishableKey", "pk_test_fixture");
  data.set("restrictedKey", "rk_test_fixture");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MERCHANT_STRIPE_TEST_ENABLED", "true");
  mocks.session.mockResolvedValue({ user: { id: 10 } });
  mocks.save.mockResolvedValue({ id: "connection" });
});
afterEach(() => vi.unstubAllEnvs());

describe("studio Stripe server action boundaries", () => {
  it("blocks writes when feature is disabled", async () => {
    vi.stubEnv("MERCHANT_STRIPE_TEST_ENABLED", "false");
    expect(await saveStudioStripe(form())).toEqual({ ok: false, error: "merchant_stripe_save_failed" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("blocks anonymous users", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await saveStudioStripe(form())).ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("derives the actor from the session, not submitted data", async () => {
    const data = form();
    data.set("userId", "999");
    expect((await saveStudioStripe(data)).ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith(10, 100, expect.objectContaining({ accountId: "acct_fixture" }));
  });
  it("redacts all unexpected failures", async () => {
    mocks.save.mockRejectedValue(new Error("rk_test_private"));
    expect(await saveStudioStripe(form())).toEqual({ ok: false, error: "merchant_stripe_save_failed" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("does not let a non-admin create studios", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect((await createTestStudio(form())).ok).toBe(false);
    expect(prisma.team.create).not.toHaveBeenCalled();
  });
});
