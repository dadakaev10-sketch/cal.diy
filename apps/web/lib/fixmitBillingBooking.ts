import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import { billingEnabled, entitled } from "./fixmitBilling";
export async function assertBillingForBooking(body: unknown) {
  if (!billingEnabled()) return;
  if (!body || typeof body !== "object") throw ErrorWithCode.Factory.BadRequest("Invalid booking");
  const id = "eventTypeId" in body ? Number(body.eventTypeId) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw ErrorWithCode.Factory.BadRequest("Invalid event type");
  const event = await prisma.eventType.findUnique({
    where: { id },
    select: {
      userId: true,
      users: { select: { id: true } },
      team: { select: { members: { where: { role: "OWNER", accepted: true }, select: { userId: true } } } },
    },
  });
  if (!event) throw ErrorWithCode.Factory.NotFound("Event unavailable");
  let owners = event.users.map((user) => user.id);
  if (event.userId) owners = [event.userId];
  if (event.team) owners = event.team.members.map((member) => member.userId);
  if (!owners.length) throw ErrorWithCode.Factory.Forbidden("Booking unavailable");
  for (const id of owners)
    if (!(await entitled(id))) throw ErrorWithCode.Factory.Forbidden("Booking unavailable");
}
