import { describe, expect, it } from "vitest";
import { fixmitCanonicalUrl } from "./fixmitCanonicalUrl";

describe("Fixmit domain migration", () => {
  it("uses the public Host header behind the standalone reverse proxy", () => {
    expect(
      fixmitCanonicalUrl(
        "http://0.0.0.0:3000/dadakaev?lang=de",
        "GET",
        "https://fixmit.com",
        "www.fixmit.com"
      )?.href
    ).toBe("https://fixmit.com/dadakaev?lang=de");
    expect(
      fixmitCanonicalUrl("http://0.0.0.0:3000/dadakaev", "GET", "https://fixmit.com", "fixmit.com")
    ).toBeNull();
    expect(
      fixmitCanonicalUrl("http://0.0.0.0:3000/dadakaev", "GET", "https://fixmit.com", "evil.example")
    ).toBeNull();
  });
  it.each([
    "cal.apps.dadakaev.tech",
    "www.fixmit.com",
  ])("preserves booking and verification links from %s", (host) => {
    expect(
      fixmitCanonicalUrl(`https://${host}/dadakaev/30min?token=example&lang=de`, "GET", "https://fixmit.com")
        ?.href
    ).toBe("https://fixmit.com/dadakaev/30min?token=example&lang=de");
  });
  it("does not redirect webhook and booking submissions", () => {
    expect(
      fixmitCanonicalUrl(
        "https://cal.apps.dadakaev.tech/api/integrations/stripepayment/webhook",
        "POST",
        "https://fixmit.com"
      )
    ).toBeNull();
  });
  it("only redirects known aliases on the configured Fixmit deployment", () => {
    expect(fixmitCanonicalUrl("https://example.com/login", "GET", "https://fixmit.com")).toBeNull();
    expect(fixmitCanonicalUrl("https://www.fixmit.com/login", "GET", "http://localhost:3000")).toBeNull();
    expect(fixmitCanonicalUrl("https://fixmit.com/login", "GET", "https://fixmit.com")).toBeNull();
  });
});
