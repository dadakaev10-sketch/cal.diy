export function fixmitCanonicalUrl(
  requestUrl: string,
  method: string,
  canonicalUrl?: string,
  requestHost?: string | null
) {
  if (canonicalUrl !== "https://fixmit.com" || !["GET", "HEAD"].includes(method)) return null;
  const url = new URL(requestUrl);
  // Standalone Next.js reconstructs request URLs using the internal container hostname.
  const hostname = requestHost?.toLowerCase().split(":")[0] || url.hostname;
  if (!["cal.apps.dadakaev.tech", "www.fixmit.com"].includes(hostname)) return null;
  url.protocol = "https:";
  url.host = "fixmit.com";
  url.port = "";
  return url;
}
