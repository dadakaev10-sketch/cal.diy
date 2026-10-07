export function fixmitCanonicalUrl(requestUrl: string, method: string, canonicalUrl?: string) {
  if (canonicalUrl !== "https://fixmit.com" || !["GET", "HEAD"].includes(method)) return null;
  const url = new URL(requestUrl);
  if (!["cal.apps.dadakaev.tech", "www.fixmit.com"].includes(url.hostname)) return null;
  url.protocol = "https:";
  url.host = "fixmit.com";
  url.port = "";
  return url;
}
