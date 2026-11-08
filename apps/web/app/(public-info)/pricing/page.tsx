import { getTranslation } from "@calcom/i18n/server";
import { resolvePublicBookingLanguage } from "@calcom/lib/publicBookingLanguage";
import type { Metadata } from "next";
import { PublicInfo } from "../../../modules/public-info/PublicInfo";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const language = resolvePublicBookingLanguage((await searchParams).lang, "de");
  const t = await getTranslation(language, "common");
  return {
    title: `${t("public_pricing_title")} | Fixmit`,
    description: t("public_pricing_description"),
    alternates: { canonical: "https://fixmit.com/pricing" },
    robots: { index: true, follow: true },
  };
}
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export default function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <PublicInfo page="pricing" searchParams={searchParams} />;
}
