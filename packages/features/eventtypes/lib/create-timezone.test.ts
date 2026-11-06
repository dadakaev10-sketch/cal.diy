import { describe, expect, it } from "vitest";
import { createEventTypeInput } from "./schemas";

const base = { title: "Studio treatment", slug: "studio-treatment", length: 60 };
describe("native in-person service timezone", () => {
  it("preserves an explicit valid booking timezone", () => {
    const result = createEventTypeInput.parse({
      ...base,
      lockTimeZoneToggleOnBookingPage: true,
      lockedTimeZone: "Europe/Vienna",
    });
    expect(result.lockTimeZoneToggleOnBookingPage).toBe(true);
    expect(result.lockedTimeZone).toBe("Europe/Vienna");
  });
  it("rejects an invalid or missing locked timezone", () => {
    expect(createEventTypeInput.safeParse({ ...base, lockTimeZoneToggleOnBookingPage: true }).success).toBe(
      false
    );
    expect(createEventTypeInput.safeParse({ ...base, lockedTimeZone: "Invalid/Zone" }).success).toBe(false);
  });
  it("retains compatibility for services with no timezone lock", () => {
    expect(createEventTypeInput.parse(base).lockTimeZoneToggleOnBookingPage).toBeUndefined();
  });
});
