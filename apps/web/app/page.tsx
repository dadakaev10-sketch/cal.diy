import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getTranslation } from "@calcom/i18n/server";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import StudioHome from "../modules/studio-home/StudioHome";
import {
  homeLanguage,
  homeMetadata,
  homeStructuredData,
  serializeStructuredData,
} from "../modules/studio-home/seo";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang;
  const language = homeLanguage(lang);
  const t = await getTranslation(language, "common");
  return homeMetadata(t, language);
}

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

const RedirectPage = async ({ searchParams }: { searchParams: Promise<{ lang?: string }> }) => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  const lang = (await searchParams).lang;
  const language = homeLanguage(lang);
  const t = await getTranslation(language, "common");
  return (
    <>
      <script
        type="application/ld+json"
        nonce={(await headers()).get("x-csp-nonce") ?? undefined}
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData(t, language)) }}
      />
      <StudioHome
        t={t}
        language={language}
        signedIn={!!session?.user?.id}
        registrationEnabled={process.env.STUDIO_REGISTRATION_ENABLED === "true"}
      />
    </>
  );
};

export default RedirectPage;
