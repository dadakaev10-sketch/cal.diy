import {
  publicBookingLanguages,
  readPublicBookingLanguage,
  resolvePublicBookingLanguage,
} from "@calcom/lib/publicBookingLanguage";
import { describe, expect, it } from "vitest";
import { updateUserMetadataAllowedKeys, ZUpdateProfileInputSchema } from "./updateProfile.schema";

describe("public booking language", () => {
  it.each(publicBookingLanguages)("allows %s through both profile validation boundaries", (language) => {
    const input = ZUpdateProfileInputSchema.parse({ metadata: { bookingPageLanguage: language } });
    expect(updateUserMetadataAllowedKeys.parse(input.metadata).bookingPageLanguage).toBe(language);
  });
  it("prefers the visitor choice over the independent studio default", () => {
    expect(resolvePublicBookingLanguage("fr", "de", "ru", "it")).toBe("fr");
    expect(resolvePublicBookingLanguage(undefined, "es", "ru", "de")).toBe("es");
  });
  it("ignores invalid or ambiguous URL values and falls back safely", () => {
    expect(resolvePublicBookingLanguage(["fr", "de"], "it")).toBe("it");
    expect(resolvePublicBookingLanguage("../../en", undefined, "ru")).toBe("ru");
    expect(resolvePublicBookingLanguage(undefined, undefined, "ja")).toBe("en");
  });
  it("reads only the independent public preference", () => {
    expect(readPublicBookingLanguage({ bookingPageLanguage: "de", locale: "fr" })).toBe("de");
    expect(readPublicBookingLanguage({ locale: "fr" })).toBeUndefined();
    expect(readPublicBookingLanguage(null)).toBeUndefined();
  });
  it("rejects unsupported persisted languages without dropping other preferences", () => {
    expect(
      ZUpdateProfileInputSchema.safeParse({ metadata: { bookingPageLanguage: "invalid" } }).success
    ).toBe(false);
    expect(
      updateUserMetadataAllowedKeys.parse({ bookingPageLanguage: "fr", defaultInPersonAddress: "Vienna" })
    ).toEqual({ bookingPageLanguage: "fr", defaultInPersonAddress: "Vienna" });
  });
});
