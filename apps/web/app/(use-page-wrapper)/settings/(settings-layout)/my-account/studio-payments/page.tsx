import { randomUUID } from "node:crypto";
import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import prisma from "@calcom/prisma";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import StudioStripeForm from "./StudioStripeForm";
import StudioStripeTest from "./StudioStripeTest";

export default async function Page() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login");
  const t = await getTranslate();
  if (process.env.MERCHANT_STRIPE_TEST_ENABLED !== "true") {
    return <p className="text-default p-6">{t("merchant_stripe_disabled")}</p>;
  }
  const userId = session.user.id;
  const [user, studios] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.team.findMany({
      where: { members: { some: { userId, accepted: true, role: "OWNER" } } },
      select: {
        id: true,
        name: true,
        merchantStripeConnection: {
          select: {
            id: true,
            accountId: true,
            verifiedAt: true,
            testCheckouts: {
              orderBy: { createdAt: "desc" },
              take: 5,
              select: { id: true, status: true, dueNowMinor: true },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-emphasis text-xl font-semibold">{t("merchant_stripe_title")}</h1>
        <p className="text-default text-sm">{t("merchant_stripe_intro")}</p>
        <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          {t("merchant_stripe_not_booking_ready")}
        </p>
      </header>
      {studios.length === 0 && <p className="text-default">{t("merchant_stripe_no_studios")}</p>}
      {studios.map((studio) => (
        <section key={studio.id} className="border-default bg-default space-y-4 rounded-lg border p-5">
          <h2 className="text-emphasis text-lg font-semibold">{studio.name}</h2>
          <p className="text-subtle text-sm">
            {t(
              studio.merchantStripeConnection ? "merchant_stripe_connected" : "merchant_stripe_not_connected"
            )}
          </p>
          <p className="text-default text-sm">{t("merchant_stripe_permissions")}</p>
          <StudioStripeForm teamId={studio.id} accountId={studio.merchantStripeConnection?.accountId} />
          {studio.merchantStripeConnection && (
            <StudioStripeTest
              teamId={studio.id}
              checkoutId={randomUUID()}
              recent={studio.merchantStripeConnection.testCheckouts}
              webhookUrl={`${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/stripe/studio-test/${studio.merchantStripeConnection.id}`}
            />
          )}
        </section>
      ))}
      {user?.role === "ADMIN" && (
        <section className="border-default bg-default space-y-4 rounded-lg border p-5">
          <h2 className="text-emphasis font-semibold">{t("merchant_stripe_create_studio")}</h2>
          <StudioStripeForm createStudio />
        </section>
      )}
    </div>
  );
}
