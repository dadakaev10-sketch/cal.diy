import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), user: vi.fn(), transaction: vi.fn() }));
vi.mock("@calcom/prisma", () => ({
  default: {
    $queryRaw: db.query,
    $executeRaw: db.execute,
    $transaction: db.transaction,
    user: { findUnique: db.user },
  },
}));

vi.mock("./fixmitPass", () => ({ activePass: vi.fn().mockResolvedValue(undefined) }));

import {
  type BillingRow,
  billingOffer,
  createBilling,
  entitled,
  hasBillingAccess,
  requiresBilling,
  subscriptionAccess,
  syncBilling,
} from "./fixmitBilling";

const now = new Date("2026-10-10T12:00:00Z");
const row: BillingRow = {
  userId: 7,
  requestId: "request-one",
  subscriptionId: "I-TEST",
  status: "ACTIVE",
  accessUntil: new Date("2026-10-24T12:00:00Z"),
  checkedAt: now,
  createdAt: now,
};
const sub = {
  id: "I-TEST",
  plan_id: "P-TEST",
  custom_id: createHmac("sha256", "test-secret").update("fixmit-paypal:7").digest("hex"),
  status: "ACTIVE" as const,
  billing_info: { next_billing_time: "2026-10-24T12:00:00Z" },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("FIXMIT_BILLING_ENABLED", "true");
  vi.stubEnv("FIXMIT_BILLING_REQUIRED_FROM", "2026-10-10T00:00:00Z");
  vi.stubEnv("PAYPAL_CLIENT_ID", "public-test-client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-only");
  vi.stubEnv("PAYPAL_PLAN_ID", "P-TEST");
  vi.stubEnv("PAYPAL_TEST_PLAN_ID", "");
  vi.stubEnv("PAYPAL_USE_TEST_PLAN", "false");
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret");
  db.transaction.mockImplementation((fn) => fn({ $queryRaw: db.query, $executeRaw: db.execute }));
  db.query.mockResolvedValue([row]);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "mock" })))
      .mockResolvedValueOnce(new Response(JSON.stringify(sub)))
  );
});

import { afterEach } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Fixmit subscription security", () => {
  it("does not extend access on a failed renewal", () => {
    expect(
      subscriptionAccess(
        { ...sub, billing_info: { ...sub.billing_info, failed_payments_count: 1 } },
        now,
        now
      )
    ).toEqual(now);
    expect(hasBillingAccess({ ...row, accessUntil: now }, now)).toBe(false);
  });

  it("grants trial and paid access only up to the verified billing date", () => {
    expect(subscriptionAccess(sub, null, now)).toEqual(row.accessUntil);
    expect(hasBillingAccess(row, now)).toBe(true);
    expect(hasBillingAccess(row, new Date("2026-10-25"))).toBe(false);
  });
  it.each([
    "APPROVAL_PENDING",
    "APPROVED",
    "SUSPENDED",
    "EXPIRED",
  ] as const)("does not activate %s subscriptions", (status) => {
    expect(subscriptionAccess({ ...sub, status }, row.accessUntil, now)).toBeNull();
    expect(hasBillingAccess({ ...row, status }, now)).toBe(false);
  });
  it("retains only the previously verified paid/trial period on cancellation", () => {
    expect(subscriptionAccess({ ...sub, status: "CANCELLED" }, row.accessUntil, now)).toEqual(
      row.accessUntil
    );
    expect(subscriptionAccess({ ...sub, status: "CANCELLED" }, null, now)).toBeNull();
  });
  it("rejects missing or unexpectedly long entitlements", () => {
    expect(subscriptionAccess({ ...sub, billing_info: {} }, null, now)).toBeNull();
    expect(
      subscriptionAccess({ ...sub, billing_info: { next_billing_time: "2027-01-01T00:00:00Z" } }, null, now)
    ).toBeNull();
  });
  it("keeps existing accounts and admins free", async () => {
    db.user.mockResolvedValue({ role: "USER", createdDate: new Date("2026-10-09") });
    expect(await requiresBilling(7)).toBe(false);
    db.user.mockResolvedValue({ role: "ADMIN", createdDate: now });
    expect(await requiresBilling(7)).toBe(false);
  });
  it("requires subscriptions for new accounts and fails closed without rollout date", async () => {
    db.user.mockResolvedValue({ role: "USER", createdDate: now });
    expect(await requiresBilling(7)).toBe(true);
    vi.stubEnv("FIXMIT_BILLING_REQUIRED_FROM", "");
    await expect(requiresBilling(7)).rejects.toThrow();
  });
  it("stores remotely verified access", async () => {
    expect((await syncBilling(7))?.status).toBe("ACTIVE");
    expect(db.execute).toHaveBeenCalledOnce();
  });
  it.each([
    { ...sub, custom_id: "another-account" },
    { ...sub, plan_id: "wrong-plan" },
    { ...sub, id: "I-OTHER" },
  ])("rejects mismatched ownership, plan, or subscription ID", async (remote) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "mock" })))
        .mockResolvedValueOnce(new Response(JSON.stringify(remote)))
    );
    await expect(syncBilling(7)).rejects.toThrow("Subscription mismatch");
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("reuses the pending subscription instead of creating a second charge", async () => {
    db.query.mockResolvedValue([{ ...row, status: "APPROVAL_PENDING" }]);
    expect(await createBilling(7)).toBe("I-TEST");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not allow a cancelled account to repeat the free trial", async () => {
    db.query.mockResolvedValue([{ ...row, status: "CANCELLED" }]);
    await expect(createBilling(7)).rejects.toThrow("Subscription already exists");
  });
  it("sends an account-bound idempotent create request", async () => {
    db.query.mockResolvedValue([{ ...row, subscriptionId: null }]);
    expect(await createBilling(7)).toBe("I-TEST");
    const options = vi.mocked(fetch).mock.calls[1][1];
    expect(options?.headers).toMatchObject({ "PayPal-Request-Id": "request-one" });
    expect(JSON.parse(String(options?.body))).toMatchObject({ custom_id: sub.custom_id, plan_id: "P-TEST" });
  });
  it("fails closed when stale access cannot be revalidated", async () => {
    db.user.mockResolvedValue({ role: "USER", createdDate: now });
    db.query.mockResolvedValue([{ ...row, checkedAt: new Date("2026-10-09") }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(entitled(7)).rejects.toThrow("offline");
  });
});

describe("Temporary live test offer", () => {
  it("keeps regular pricing when the temporary offer is disabled", () => {
    vi.stubEnv("PAYPAL_TEST_PLAN_ID", "P-LIVE-TEST");
    expect(billingOffer()).toEqual({ planId: "P-TEST", isTest: false });
  });
  it("selects the test offer globally only through server configuration", () => {
    vi.stubEnv("PAYPAL_TEST_PLAN_ID", "P-LIVE-TEST");
    vi.stubEnv("PAYPAL_USE_TEST_PLAN", "true");
    expect(billingOffer()).toEqual({ planId: "P-LIVE-TEST", isTest: true });
  });
  it("fails closed rather than charging the regular price if test configuration is incomplete", () => {
    vi.stubEnv("PAYPAL_USE_TEST_PLAN", "true");
    expect(() => billingOffer()).toThrow();
  });
  it("creates the test plan when the temporary offer is enabled", async () => {
    vi.stubEnv("PAYPAL_TEST_PLAN_ID", "P-LIVE-TEST");
    vi.stubEnv("PAYPAL_USE_TEST_PLAN", "true");
    db.query.mockResolvedValue([{ ...row, subscriptionId: null }]);
    await createBilling(7);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).plan_id).toBe("P-LIVE-TEST");
  });
  it("still processes test subscription webhooks after the offer is disabled", async () => {
    vi.stubEnv("PAYPAL_TEST_PLAN_ID", "P-LIVE-TEST");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "mock" })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ...sub, plan_id: "P-LIVE-TEST", status: "CANCELLED" }))
        )
    );
    expect((await syncBilling(7))?.status).toBe("CANCELLED");
    expect(db.execute).toHaveBeenCalledOnce();
  });
});
