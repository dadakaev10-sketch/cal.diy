export type CustomerBooking = {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
};
export type CustomerSource = {
  name: string;
  email: string;
  phoneNumber: string | null;
  booking: CustomerBooking | null;
};
export type Customer = {
  email: string;
  name: string;
  phoneNumber: string | null;
  bookings: CustomerBooking[];
};

export function buildCustomerDirectory(attendees: CustomerSource[]): Customer[] {
  const customers = new Map<string, Customer>();
  const sorted = [...attendees].sort((a, b) =>
    (b.booking?.startTime ?? "").localeCompare(a.booking?.startTime ?? "")
  );
  for (const attendee of sorted) {
    const email = attendee.email.trim().toLowerCase();
    if (!email || !attendee.booking) continue;
    const customer = customers.get(email) ?? {
      email,
      name: "",
      phoneNumber: null,
      bookings: [],
    };
    if (!customer.name) customer.name = attendee.name.trim();
    if (!customer.phoneNumber) customer.phoneNumber = attendee.phoneNumber?.trim() || null;
    if (!customer.bookings.some((booking) => booking.id === attendee.booking?.id)) {
      customer.bookings.push(attendee.booking);
    }
    customers.set(email, customer);
  }
  return Array.from(customers.values());
}
