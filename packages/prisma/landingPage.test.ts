import { describe, expect, it } from "vitest";
import { updateUserMetadataAllowedKeys } from "../trpc/server/routers/viewer/me/updateProfile.schema";
import { defaultLandingPage, landingPageSchema, publicLandingPage, readLandingPage } from "./landingPage";

describe("landing page settings", () => {
  it("keeps legacy and invalid profiles in direct booking mode", () => {
    expect(readLandingPage(null)).toEqual(defaultLandingPage);
    expect(publicLandingPage({ landingPage: { mode: "landing" } })).toBeNull();
  });
  it("exposes only the configured public page, and nothing when disabled", () => {
    const page = { ...defaultLandingPage, mode: "landing", headline: "Studio" };
    expect(publicLandingPage({ landingPage: page, stripeCustomerId: "private" })).toEqual(page);
    expect(publicLandingPage({ landingPage: { ...page, mode: "booking" } })).toBeNull();
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "//evil.test",
    "http://example.com",
    "https://user:secret@example.com",
  ])("rejects unsafe external links: %s", (url) => {
    expect(
      landingPageSchema.safeParse({ ...defaultLandingPage, links: [{ label: "Link", url }] }).success
    ).toBe(false);
  });
  it("accepts safe links and authenticates the metadata whitelist", () => {
    const page = { ...defaultLandingPage, links: [{ label: "Website", url: "https://example.com" }] };
    expect(updateUserMetadataAllowedKeys.parse({ landingPage: page, stripeCustomerId: "no" })).toEqual({
      landingPage: page,
    });
  });
  it("rejects SVG uploads and limits uploaded size", () => {
    for (const coverImage of [
      "data:image/svg+xml;base64,PHN2Zz4=",
      `data:image/png;base64,${"a".repeat(2800001)}`,
    ]) {
      expect(landingPageSchema.safeParse({ ...defaultLandingPage, coverImage }).success).toBe(false);
    }
  });
  it("does not serialize unprocessed uploads", () => {
    expect(
      publicLandingPage({
        landingPage: { ...defaultLandingPage, mode: "landing", coverImage: "data:image/png;base64,YQ==" },
      })?.coverImage
    ).toBe("");
  });
});

describe("creator sections", () => {
  const section = {
    id: "00000000-0000-4000-8000-000000000001",
    type: "link",
    title: "Workshop",
    description: "Learn together",
    image: "",
    url: "https://example.com/workshop",
    buttonLabel: "Join",
    priceLabel: "79 €",
    enabled: true,
  };
  it("adds defaults to previously saved landing pages", () => {
    const { sections, socialLinks, showBookingButton, ...legacy } = defaultLandingPage;
    expect(readLandingPage({ landingPage: { ...legacy, mode: "landing" } })).toEqual({
      ...defaultLandingPage,
      mode: "landing",
    });
  });
  it("preserves section order while excluding hidden content from public props", () => {
    const hidden = {
      ...section,
      id: "00000000-0000-4000-8000-000000000002",
      enabled: false,
      title: "Unpublished",
    };
    const second = { ...section, id: "00000000-0000-4000-8000-000000000003", title: "Second" };
    const metadata = {
      landingPage: { ...defaultLandingPage, mode: "landing", sections: [second, hidden, section] },
    };
    expect(readLandingPage(metadata).sections).toHaveLength(3);
    expect(publicLandingPage(metadata)?.sections.map((item) => item.title)).toEqual(["Second", "Workshop"]);
  });
  it("rejects duplicate IDs, excessive sections, and missing link destinations", () => {
    for (const sections of [
      [section, section],
      Array.from({ length: 13 }, (_, i) => ({
        ...section,
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })),
      [{ ...section, url: "" }],
    ]) {
      expect(landingPageSchema.safeParse({ ...defaultLandingPage, sections }).success).toBe(false);
    }
  });
  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,test",
    "http://example.com",
    "https://user:pass@example.com",
  ])("rejects unsafe section and social URLs: %s", (url) => {
    for (const field of ["url", "image"])
      expect(
        landingPageSchema.safeParse({ ...defaultLandingPage, sections: [{ ...section, [field]: url }] })
          .success
      ).toBe(false);
    expect(
      landingPageSchema.safeParse({ ...defaultLandingPage, socialLinks: [{ platform: "instagram", url }] })
        .success
    ).toBe(false);
  });
  it("accepts text and booking sections without external links and stores them through the profile whitelist", () => {
    const page = {
      ...defaultLandingPage,
      layout: "creator",
      showBookingButton: false,
      sections: [{ ...section, type: "text", url: "" }],
      socialLinks: [{ platform: "youtube", url: "https://youtube.com/@example" }],
    };
    expect(updateUserMetadataAllowedKeys.parse({ landingPage: page })).toEqual({ landingPage: page });
    expect(
      landingPageSchema.safeParse({ ...page, sections: [{ ...section, type: "booking", url: "" }] }).success
    ).toBe(true);
  });
  it("rejects duplicate social platforms", () => {
    const link = { platform: "instagram", url: "https://instagram.com/example" };
    expect(landingPageSchema.safeParse({ ...defaultLandingPage, socialLinks: [link, link] }).success).toBe(
      false
    );
  });
});
