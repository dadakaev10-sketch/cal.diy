import { describe, expect, it } from "vitest";
import { buildCustomerDirectory, type CustomerSource } from "./customer-directory";

const entry = (overrides: Partial<CustomerSource> = {}): CustomerSource => ({
  name: "Anna",
  email: "anna@example.com",
  phoneNumber: "+43 123",
  booking: {
    id: 1,
    title: "Consultation",
    startTime: "2026-10-01T10:00:00Z",
    endTime: "2026-10-01T11:00:00Z",
    status: "ACCEPTED",
  },
  ...overrides,
});

describe("customer directory", () => {
  it("merges case-insensitive emails and keeps each appointment once", () => {
    const source = entry();
    const customers = buildCustomerDirectory([
      source,
      entry({ email: " ANNA@EXAMPLE.COM " }),
      entry({
        booking: { ...source.booking!, id: 2, startTime: "2026-11-01T10:00:00Z" },
        name: "Anna New",
        phoneNumber: null,
      }),
    ]);
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      name: "Anna New",
      email: "anna@example.com",
      phoneNumber: "+43 123",
    });
    expect(customers[0].bookings.map((booking) => booking.id)).toEqual([2, 1]);
  });
  it("keeps different customers separate and excludes orphan attendees", () => {
    expect(
      buildCustomerDirectory([
        entry(),
        entry({ email: "other@example.com" }),
        entry({ booking: null }),
        entry({ email: " " }),
      ])
    ).toHaveLength(2);
  });
  it("preserves cancelled appointments in the customer history", () => {
    const source = entry();
    expect(
      buildCustomerDirectory([entry({ booking: { ...source.booking!, status: "CANCELLED" } })])[0].bookings[0]
        .status
    ).toBe("CANCELLED");
  });
});
