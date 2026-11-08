import { loadTranslations } from "@calcom/i18n/server";
import { readPublicBookingLanguage, resolvePublicBookingLanguage } from "@calcom/lib/publicBookingLanguage";
import { prisma } from "@calcom/prisma";
import { CustomI18nProvider } from "app/CustomI18nProvider";
import type { ReactNode } from "react";
import { PublicBookingLanguageSelect } from "./PublicBookingLanguageSelect";

export async function PublicBookingLanguage({
  username,
  requested,
  eventLanguage,
  children,
}: {
  username: string | string[] | undefined;
  requested: string | string[] | undefined;
  eventLanguage?: string | null;
  children: ReactNode;
}) {
  const user =
    typeof username === "string"
      ? await prisma.user.findFirst({
          where: { username: { equals: username, mode: "insensitive" } },
          select: { metadata: true, locale: true },
        })
      : null;
  const language = resolvePublicBookingLanguage(
    requested,
    readPublicBookingLanguage(user?.metadata),
    eventLanguage,
    user?.locale
  );
  const translations = await loadTranslations(language, "common");
  return (
    <CustomI18nProvider translations={translations} locale={language} ns="common">
      <div lang={language}>
        <PublicBookingLanguageSelect language={language} label={translations.language} />
        {children}
      </div>
    </CustomI18nProvider>
  );
}
