import type { MetadataRoute } from "next";
import { HOME_LANGUAGES, homeUrl } from "../modules/studio-home/seo";

// List only public marketing pages; never expose customer or booking data.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(HOME_LANGUAGES.map((language) => [language, homeUrl(language)]));
  return HOME_LANGUAGES.map((language) => ({ url: homeUrl(language), alternates: { languages } }));
}
