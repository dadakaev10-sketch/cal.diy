import { z } from "zod";

export const publicBookingLanguages = ["en", "de", "es", "ru", "it", "fr"] as const;
export const publicBookingLanguageSchema = z.enum(publicBookingLanguages);
export type PublicBookingLanguage = z.infer<typeof publicBookingLanguageSchema>;
export const publicBookingLanguageNames: Record<PublicBookingLanguage, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  ru: "Русский",
  it: "Italiano",
  fr: "Français",
};

export function readPublicBookingLanguage(metadata: unknown): PublicBookingLanguage | undefined {
  const result = z
    .object({ bookingPageLanguage: publicBookingLanguageSchema.optional() })
    .safeParse(metadata);
  return result.success ? result.data.bookingPageLanguage : undefined;
}

export function resolvePublicBookingLanguage(...choices: unknown[]): PublicBookingLanguage {
  for (const choice of choices) {
    const result = publicBookingLanguageSchema.safeParse(choice);
    if (result.success) return result.data;
  }
  return "en";
}
