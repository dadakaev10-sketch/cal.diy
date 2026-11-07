import { describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({ default: {} }));

import { deliver, deviceInput, parseDevice, pushPayload } from "./studioPush";

describe("native studio push", () => {
  it("accepts an APNs token and explicit environment", () => {
    expect(deviceInput.safeParse({ token: "ab".repeat(32), environment: "sandbox" }).success).toBe(true);
  });
  it("rejects arbitrary endpoints, environments and malformed tokens", () => {
    for (const value of [
      { token: "https://host.invalid", environment: "production" },
      { token: "ab".repeat(32), environment: "other" },
      { token: "ab".repeat(32), environment: "production", endpoint: "https://host.invalid" },
    ])
      expect(deviceInput.safeParse(value).success).toBe(false);
  });
  it("ignores web-push and malformed stored subscriptions", () => {
    expect(parseDevice('{"endpoint":"https://host.invalid"}')).toBeNull();
    expect(parseDevice("invalid")).toBeNull();
  });
  it("preserves recent event deduplication state", () => {
    expect(
      parseDevice(
        JSON.stringify({
          kind: "fixmit-apns-v1",
          token: "ab".repeat(32),
          environment: "production",
          sent: ["event"],
        })
      )?.sent
    ).toEqual(["event"]);
  });
  it("uses the studio timezone and opens a booking without lock-screen customer data", () => {
    const result = pushPayload("created", "booking-uid", new Date("2026-11-07T09:00:00Z"), "Europe/Vienna");
    expect(result.bookingUid).toBe("booking-uid");
    expect(result.aps.alert.body).toContain("10:00");
    expect(Object.keys(result)).toEqual(["aps", "bookingUid"]);
    expect(result.aps.alert.title).toBe("Neue Buchung");
  });
  it("distinguishes cancellation and rescheduling", () => {
    expect(pushPayload("cancelled", "id", new Date(), "UTC").aps.alert.title).toBe("Termin abgesagt");
    expect(pushPayload("rescheduled", "id", new Date(), "UTC").aps.alert.title).toBe("Termin verschoben");
  });
  it("fails closed when APNs credentials are absent", async () => {
    vi.stubEnv("APNS_PRIVATE_KEY_BASE64", "");
    await expect(deliver("ab".repeat(32), "sandbox", {}, "event")).rejects.toThrow("APNS_NOT_CONFIGURED");
    vi.unstubAllEnvs();
  });
});

describe("push language", () => {
  it.each([
    ["en", "New booking"],
    ["de", "Neue Buchung"],
    ["es", "Nueva reserva"],
    ["ru", "Новая запись"],
    ["it", "Nuova prenotazione"],
    ["fr", "Nouvelle réservation"],
  ] as const)("uses the device's %s language without client details", (locale, title) => {
    const payload = pushPayload("created", "uid", new Date("2026-11-07T09:00:00Z"), "Europe/Vienna", locale);
    expect(payload.aps.alert.title).toBe(title);
    expect(Object.keys(payload)).toEqual(["aps", "bookingUid"]);
    expect(deviceInput.parse({ token: "ab".repeat(32), environment: "production", locale }).locale).toBe(
      locale
    );
  });
  it("defaults older device registrations to German", () => {
    expect(
      parseDevice(
        JSON.stringify({
          token: "ab".repeat(32),
          environment: "sandbox",
          kind: "fixmit-apns-v1",
          sent: ["event"],
        })
      )?.locale
    ).toBe("de");
  });
  it("rejects unsupported notification locales", () => {
    expect(
      deviceInput.safeParse({ token: "ab".repeat(32), environment: "production", locale: "invalid" }).success
    ).toBe(false);
  });
});
