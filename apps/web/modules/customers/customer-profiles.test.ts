import { describe, expect, it } from "vitest";
import { applyCustomerProfiles } from "./customer-directory";

describe("studio contact profiles", () => {
  const booking = {
    id: 1,
    title: "Treatment",
    startTime: "2030-01-01",
    endTime: "2030-01-01",
    status: "ACCEPTED",
  };
  it("keeps history after email changes without changing booking records", () => {
    const a = { email: "old@example.invalid", name: "Old", phoneNumber: null, bookings: [booking] };
    const b = {
      email: "new@example.invalid",
      name: "New",
      phoneNumber: null,
      bookings: [booking, { ...booking, id: 2 }],
    };
    const result = applyCustomerProfiles(
      [a, b],
      [{ sourceEmail: a.email, email: b.email, name: "Edited", phone: "+43123", aliases: [a.email] }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].bookings).toHaveLength(2);
    expect(result[0].name).toBe("Edited");
    expect(a.name).toBe("Old");
  });
  it("does not change unrelated contacts", () => {
    const a = { email: "other@example.invalid", name: "Other", phoneNumber: null, bookings: [booking] };
    expect(
      applyCustomerProfiles(
        [a],
        [
          {
            sourceEmail: "source@example.invalid",
            email: "new@example.invalid",
            name: "New",
            phone: "",
            aliases: [],
          },
        ]
      )[0]
    ).toBe(a);
  });
});
