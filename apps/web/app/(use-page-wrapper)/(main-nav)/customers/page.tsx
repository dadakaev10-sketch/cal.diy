import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { prisma } from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata, getTranslate } from "app/_utils";
import { ShellMainAppDir } from "app/(use-page-wrapper)/(main-nav)/ShellMainAppDir";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildCustomerDirectory } from "~/customers/customer-directory";
import CustomersView from "~/customers/customers-view";

export const dynamic = "force-dynamic";
export const generateMetadata = async () =>
  _generateMetadata(
    (t) => t("customer_directory"),
    (t) => t("customer_directory_description")
  );

export default async function Page() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) return redirect("/auth/login");
  const t = await getTranslate();
  const attendees = await prisma.attendee.findMany({
    where: { booking: { userId: session.user.id } },
    select: {
      name: true,
      email: true,
      phoneNumber: true,
      booking: { select: { id: true, title: true, startTime: true, endTime: true, status: true } },
    },
  });
  const customers = buildCustomerDirectory(
    attendees.map((attendee) => ({
      ...attendee,
      booking: attendee.booking
        ? {
            ...attendee.booking,
            startTime: attendee.booking.startTime.toISOString(),
            endTime: attendee.booking.endTime.toISOString(),
          }
        : null,
    }))
  );
  return (
    <ShellMainAppDir heading={t("customer_directory")} subtitle={t("customer_directory_description")}>
      <CustomersView customers={customers} />
    </ShellMainAppDir>
  );
}
