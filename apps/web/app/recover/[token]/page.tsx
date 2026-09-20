import { studioTokenHash } from "@calcom/features/auth/lib/studioAccountSecurity";
import { getTranslation } from "@calcom/i18n/server";
import prisma from "@calcom/prisma";
import styles from "../../../modules/auth/studio-auth.module.css";
import StudioRecoveryForm from "../../../modules/auth/studio-recovery-form";
import { studioRegistrationKeys } from "../../../modules/auth/studio-registration-labels";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Passwort zurücksetzen | DADAKAEV CAL",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const locale = (await searchParams).lang === "en" ? "en" : "de";
  const t = await getTranslation(locale, "common");
  const request = /^[a-f0-9]{64}$/.test(token)
    ? await prisma.resetPasswordRequest.findFirst({
        where: { id: studioTokenHash(token), expires: { gt: new Date() } },
        select: { id: true },
      })
    : null;
  return (
    <main className={styles.shell} lang={locale}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          DADAKAEV <strong>CAL</strong>
        </a>
        <h1>{t(request ? "reset_password" : "request_is_expired")}</h1>
        {request ? (
          <StudioRecoveryForm
            token={token}
            labels={Object.fromEntries(
              [
                ...studioRegistrationKeys,
                "reset_password",
                "request_password_reset",
                "password_reset_email_sent",
                "password_updated",
              ].map((key) => [key, t(key)])
            )}
          />
        ) : (
          <a className={styles.primary} href="/recover">
            {t("try_again")}
          </a>
        )}
      </section>
    </main>
  );
}
