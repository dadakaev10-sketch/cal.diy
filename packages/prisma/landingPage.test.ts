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
