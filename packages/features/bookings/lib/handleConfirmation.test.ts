import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  notify: vi.fn(),
  emails: vi.fn(),
  webhooks: vi.fn(),
}));
vi.mock("@calcom/features/bookings/lib/EventManager", () => ({
  default: class {
    create = mocks.create;
  },
}));
vi.mock("@calcom/features/notifications/studioPush", () => ({ notifyStudioBooking: mocks.notify }));
vi.mock("@calcom/emails/email-manager", () => ({ sendScheduledEmailsAndSMS: mocks.emails }));
vi.mock("@calcom/features/webhooks/lib/getWebhooks", () => ({ default: mocks.webhooks }));
vi.mock("@calcom/features/webhooks/lib/scheduleTrigger", () => ({ scheduleTrigger: vi.fn() }));
vi.mock("@calcom/features/webhooks/lib/sendOrSchedulePayload", () => ({ default: vi.fn() }));
vi.mock("@calcom/lib/CalEventParser", () => ({ getVideoCallUrlFromCalEvent: vi.fn() }));
vi.mock("@calcom/lib/tracing/factory", () => ({
  distributedTracing: { createSpan: vi.fn(), getTracingLogger: () => ({ error: vi.fn() }) },
}));
vi.mock("./handleNewBooking/scheduleNoShowTriggers", () => ({ scheduleNoShowTriggers: vi.fn() }));
vi.mock("./getCalEventResponses", () => ({ getCalEventResponses: () => ({}) }));

import { handleConfirmation } from "./handleConfirmation";

function fixture() {
  const startTime = new Date("2026-11-10T09:00:00Z");
  return {
    user: { username: "demo-studio" },
    evt: { uid: "demo-confirmed-booking" },
    prisma: { booking: { update: mocks.update } },
    bookingId: 1,
    booking: {
      id: 1,
      uid: "demo-confirmed-booking",
      startTime,
      userId: 7,
      eventTypeId: 2,
      status: "PENDING",
      metadata: {},
      eventType: {
        id: 2,
        title: "Demo treatment",
        currency: "eur",
        price: 7000,
        length: 60,
        requiresConfirmation: false,
        metadata: {},
      },
    },
    paid: true,
    traceContext: {},
  } as unknown as Parameters<typeof handleConfirmation>[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.webhooks.mockResolvedValue([]);
  mocks.create.mockResolvedValue({
    results: [{ success: false, type: "apple_calendar" }],
    referencesToCreate: [],
  });
  mocks.update.mockResolvedValue({
    uid: "demo-confirmed-booking",
    status: "ACCEPTED",
    eventType: null,
    startTime: new Date("2026-11-10T09:00:00Z"),
    metadata: {},
  });
});

describe("confirmed booking push", () => {
  it("notifies after accepting a paid booking despite calendar failure", async () => {
    await handleConfirmation(fixture());
    expect(mocks.emails).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith("demo-confirmed-booking", "created");
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.notify.mock.invocationCallOrder[0]);
  });

  it("notifies when confirmation emails are disabled", async () => {
    mocks.create.mockResolvedValue({ results: [], referencesToCreate: [] });
    await handleConfirmation({ ...fixture(), emailsEnabled: false });
    expect(mocks.emails).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("does not notify acceptance when saving confirmation fails", async () => {
    mocks.update.mockRejectedValue(new Error("Storage unavailable"));
    await expect(handleConfirmation(fixture())).rejects.toThrow("Storage unavailable");
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
