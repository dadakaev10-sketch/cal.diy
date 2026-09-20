import process from "node:process";
import { studioTokenHash } from "@calcom/features/auth/lib/studioAccountSecurity";
import { getTranslation } from "@calcom/i18n/server";
import prisma from "@calcom/prisma";
import { notFound } from "next/navigation";
import styles from "../../../modules/auth/studio-auth.module.css";
import StudioRegistrationForm from "../../../modules/auth/studio-registration-form";
import { studioRegistrationKeys } from "../../../modules/auth/studio-registration-labels";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Studio | DADAKAEV CAL",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; lang?: string }>;
}) {
  if (process.env.STUDIO_REGISTRATION_ENABLED !== "true") notFound();
  const params = await searchParams;
  const locale = params.lang === "en" ? "en" : "de";
  const t = await getTranslation(locale, "common");
  const token = params.token || "";
  const request = /^[a-f0-9]{64}$/.test(token)
    ? await prisma.studioRegistrationRequest.findFirst({
        where: { tokenHash: studioTokenHash(token), expiresAt: { gt: new Date() } },
        select: { studioName: true },
      })
    : null;
  return (
    <main className={styles.shell} lang={locale}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          DADAKAEV <strong>CAL</strong>
        </a>
        <h1>{t(request ? "studio_registration_verify" : "request_is_expired")}</h1>
        {request ? (
          <StudioRegistrationForm
            mode="complete"
            locale={locale}
            token={token}
            studioName={request.studioName}
            labels={Object.fromEntries(studioRegistrationKeys.map((key) => [key, t(key)]))}
          />
        ) : (
          <a className={styles.primary} href="/register">
            {t("try_again")}
          </a>
        )}
      </section>
    </main>
  );
}
