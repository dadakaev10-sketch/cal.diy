import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getTranslation } from "@calcom/i18n/server";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import StudioHome from "../modules/studio-home/StudioHome";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang;
  const t = await getTranslation(lang === "en" || lang === "ru" ? lang : "de", "common");
  return { title: `Fixmit · ${t("home_footer")}`, description: t("home_description") };
}

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

const RedirectPage = async ({ searchParams }: { searchParams: Promise<{ lang?: string }> }) => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  const lang = (await searchParams).lang;
  const language = lang === "en" || lang === "ru" ? lang : "de";
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
