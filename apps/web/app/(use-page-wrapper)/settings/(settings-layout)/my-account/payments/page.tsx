import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import StripePaymentsForm from "./StripePaymentsForm";
export const metadata = { title: "Stripe | Fixmit", robots: { index: false, follow: false } };
export default async function Page() {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) redirect("/auth/login?callbackUrl=/settings/my-account/payments");
  return <StripePaymentsForm />;
}
