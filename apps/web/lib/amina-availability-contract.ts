import { z } from "zod";

export const fixmitBookingQuery = z.object({
  view: z.enum(["upcoming", "past", "cancelled", "all"]).default("upcoming"),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const fixmitBookingsSchema = z.object({
  bookings: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      status: z.enum(["ACCEPTED", "PENDING", "AWAITING_HOST", "CANCELLED", "REJECTED"]),
      rescheduled: z.boolean().nullable(),
      attendees: z.array(
        z.object({
          name: z.string(),
          email: z.string(),
          phoneNumber: z.string().nullable(),
        })
      ),
    })
  ),
  count: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.literal(50),
  checked_at: z.string().datetime(),
});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const fixmitPeriodSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).max(7),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    start: time,
    end: time,
  })
  .strict();
export const fixmitAvailabilityInput = z
  .object({
    scheduleId: z.number().int().positive(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    periods: z.array(fixmitPeriodSchema).max(500),
  })
  .strict()
  .superRefine(({ periods }, ctx) => {
    const slots = new Map<string, { start: string; end: string }[]>();
    for (let index = 0; index < periods.length; index++) {
      const p = periods[index];
      const stamp = p.date ? new Date(`${p.date}T00:00:00Z`) : null;
      const validDate =
        !p.date ||
        (!!stamp && Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === p.date);
      const closed = !!p.date && p.start === "00:00" && p.end === "00:00";
      if (
        !validDate ||
        (p.date ? p.days.length !== 0 : !p.days.length) ||
        (!closed && p.start >= p.end) ||
        new Set(p.days).size !== p.days.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["periods", index],
          message: "Ungültiges Zeitfenster. Geschlossene Ausnahmetage: 00:00 bis 00:00.",
        });
      }
      for (const key of p.date ? [`date:${p.date}`] : p.days.map((d) => `day:${d}`)) {
        const existing = slots.get(key) ?? [];
        if (
          existing.some(
            (other) => closed || other.start === other.end || (p.start < other.end && p.end > other.start)
          )
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["periods", index],
            message: "Zeitfenster überschneiden sich.",
          });
        }
        existing.push(p);
        slots.set(key, existing);
      }
    }
  });
export const fixmitAvailabilitySchema = z.object({
  schedules: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      timeZone: z.string(),
      isDefault: z.boolean(),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      periods: z.array(fixmitPeriodSchema),
      services: z.array(z.object({ id: z.number().int(), title: z.string() })),
    })
  ),
  checked_at: z.string().datetime(),
});
export type FixmitBookings = z.infer<typeof fixmitBookingsSchema>;
export type FixmitAvailability = z.infer<typeof fixmitAvailabilitySchema>;
export type FixmitPeriod = z.infer<typeof fixmitPeriodSchema>;
