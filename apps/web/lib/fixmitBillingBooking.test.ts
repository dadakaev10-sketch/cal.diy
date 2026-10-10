import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), entitled: vi.fn(), event: vi.fn() }));
vi.mock("./fixmitBilling", () => ({ billingEnabled: mocks.enabled, entitled: mocks.entitled }));
vi.mock("@calcom/prisma", () => ({ default: { eventType: { findUnique: mocks.event } } }));

import { assertBillingForBooking } from "./fixmitBillingBooking";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
});
describe("public booking subscription enforcement", () => {
  it("rejects unpaid individual hosts", async () => {
    mocks.event.mockResolvedValue({ userId: 7, team: null, users: [] });
    mocks.entitled.mockResolvedValue(false);
    await expect(assertBillingForBooking({ eventTypeId: 1 })).rejects.toThrow("Booking unavailable");
  });
  it("permits subscribed or grandfathered hosts", async () => {
    mocks.event.mockResolvedValue({ userId: 7, team: null, users: [] });
    mocks.entitled.mockResolvedValue(true);
    await expect(assertBillingForBooking({ eventTypeId: 1 })).resolves.toBeUndefined();
  });
  it("checks team owners instead of trusting client identity", async () => {
    mocks.event.mockResolvedValue({ userId: null, team: { members: [{ userId: 7 }] }, users: [{ id: 99 }] });
    mocks.entitled.mockResolvedValue(true);
    await assertBillingForBooking({ eventTypeId: 1, userId: 99 });
    expect(mocks.entitled).toHaveBeenCalledWith(7);
  });
  it("rejects hostless events and invalid event IDs", async () => {
    mocks.event.mockResolvedValue({ userId: null, team: null, users: [] });
    await expect(assertBillingForBooking({ eventTypeId: 1 })).rejects.toThrow();
    await expect(assertBillingForBooking({ eventTypeId: "bad" })).rejects.toThrow();
  });
  it("does not change bookings before rollout", async () => {
    mocks.enabled.mockReturnValue(false);
    await assertBillingForBooking({});
    expect(mocks.event).not.toHaveBeenCalled();
  });
});
