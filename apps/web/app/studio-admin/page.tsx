import process from "node:process";
import { getTranslation } from "@calcom/i18n/server";
import { getStudioAdmin } from "@lib/studioAdmin";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest } from "next/server";
import styles from "../../modules/auth/studio-auth.module.css";
import StudioRegistrationForm from "../../modules/auth/studio-registration-form";
import { studioRegistrationKeys } from "../../modules/auth/studio-registration-labels";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Studio administration | DADAKAEV CAL",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const req = new NextRequest(new URL("/studio-admin", process.env.NEXTAUTH_URL), {
    headers: await headers(),
  });
  if (!(await getStudioAdmin(req))) notFound();
  const locale = (await searchParams).lang === "en" ? "en" : "de";
  const t = await getTranslation(locale, "common");
  return (
    <main className={styles.shell} lang={locale}>
      <section className={styles.card}>
        <a className={styles.brand} href="/settings/admin/users">
          DADAKAEV <strong>CAL</strong>
        </a>
        <h1>{t("studio_admin_create")}</h1>
        <p>{t("studio_admin_intro")}</p>
        <StudioRegistrationForm
          mode="admin"
          locale={locale}
          labels={Object.fromEntries(studioRegistrationKeys.map((key) => [key, t(key)]))}
        />
      </section>
    </main>
  );
}
