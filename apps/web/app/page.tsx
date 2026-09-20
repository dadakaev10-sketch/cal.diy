import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getTranslation } from "@calcom/i18n/server";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import StudioHome from "../modules/studio-home/StudioHome";

export const metadata = {
  title: "DADAKAEV CAL · Terminplanung für Studios",
  description:
    "Ein klarer Platz für deine Leistungen, deine Zeiten und deine Termine. Entdecke DADAKAEV CAL für Studios und Salons.",
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

const RedirectPage = async ({ searchParams }: { searchParams: Promise<{ lang?: string }> }) => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  const language = (await searchParams).lang === "en" ? "en" : "de";
  const t = await getTranslation(language, "common");
  return (
    <StudioHome
      t={t}
      language={language}
      signedIn={!!session?.user?.id}
      registrationEnabled={process.env.STUDIO_REGISTRATION_ENABLED === "true"}
    />
  );
};

export default RedirectPage;
