import { PublicInfo } from "../../../modules/public-info/PublicInfo";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Support | Fixmit",
  alternates: { canonical: "https://fixmit.com/support" },
  robots: { index: true, follow: true },
};
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export default function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  return <PublicInfo page="support" searchParams={searchParams} />;
}
