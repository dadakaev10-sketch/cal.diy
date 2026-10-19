import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn(), cancel: vi.fn() }));
vi.mock("@calcom/prisma", () => ({ default: { payment: { findMany: m.find } } }));
vi.mock("./cancelUnpaidBooking", () => ({ DEPOSIT_TIMEOUT_MS: 900000, cancelUnpaidBooking: m.cancel }));

import { expireDeposits } from "./expireDeposits";

beforeEach(() => vi.resetAllMocks());
it("restricts scans to old unpaid deposits and continues after provider errors", async () => {
  m.find.mockResolvedValue([
    { id: 1, uid: "expired" },
    { id: 2, uid: "processing" },
    { id: 3, uid: "outage" },
  ]);
  m.cancel
    .mockResolvedValueOnce({ cancelled: true })
    .mockResolvedValueOnce({ cancelled: false })
    .mockRejectedValueOnce(new Error("network"));
  expect(await expireDeposits()).toEqual({ checked: 3, cancelled: 1, skipped: 1, errors: 1, nextCursor: 0 });
  expect(m.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        success: false,
        refunded: false,
        data: { path: ["kind"], equals: "deposit" },
        booking: { is: { status: "PENDING", paid: false, createdAt: { lte: expect.any(Date) } } },
      }),
    })
  );
  expect(m.cancel).toHaveBeenCalledWith("expired", true);
});
it("returns a cursor so processing payments cannot starve later bookings", async () => {
  m.find.mockResolvedValue(Array.from({ length: 25 }, (_, i) => ({ id: i + 26, uid: String(i) })));
  m.cancel.mockResolvedValue({ cancelled: false });
  expect((await expireDeposits(25)).nextCursor).toBe(50);
  expect(m.find).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ id: { gt: 25 } }) })
  );
});
