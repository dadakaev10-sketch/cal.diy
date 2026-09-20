import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkOnboardingRedirect } from "@calcom/features/auth/lib/onboardingUtils";
import { getTranslation } from "@calcom/i18n/server";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import StudioHome from "../modules/studio-home/StudioHome";

export const metadata = {
  title: "DADAKAEV CAL · Terminplanung für Studios",
  description:
    "Ein klarer Platz für deine Leistungen, deine Zeiten und deine Termine. Entdecke DADAKAEV CAL für Studios und Salons.",
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

const RedirectPage = async ({ searchParams }: { searchParams: Promise<{ lang?: string }> }) => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) {
    const language = (await searchParams).lang === "en" ? "en" : "de";
    const t = await getTranslation(language, "common");
    return <StudioHome t={t} language={language} />;
  }

  // Check if user needs onboarding and redirect before going to event-types
  const organizationId = session.user.profile?.organizationId ?? null;
  const onboardingPath = await checkOnboardingRedirect(session.user.id, {
    checkEmailVerification: true,
    organizationId,
  });
  if (onboardingPath) {
    redirect(onboardingPath);
  }

  redirect("/event-types");
};

export default RedirectPage;
