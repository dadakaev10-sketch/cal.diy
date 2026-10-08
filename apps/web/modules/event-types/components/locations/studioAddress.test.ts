import { readStudioAddress, studioAddressSchema, userMetadata } from "@calcom/prisma/zod-utils";
import { updateUserMetadataAllowedKeys } from "@calcom/trpc/server/routers/viewer/me/updateProfile.schema";
import { describe, expect, it } from "vitest";
import { buildStudioLocationOptions, getStudioLocationAddress } from "./studioAddress";

const options = [
  { value: "inPerson", label: "Original" },
  { value: "attendeeInPerson", label: "Customer" },
];

describe("saved studio address", () => {
  it("reads only valid profile addresses and handles missing metadata", () => {
    expect(readStudioAddress(null)).toBe("");
    expect(readStudioAddress({ defaultInPersonAddress: 42 })).toBe("");
    expect(readStudioAddress({ defaultInPersonAddress: " Example road " })).toBe("Example road");
  });
  it("survives both profile validation and the metadata update allowlist", () => {
    const metadata = userMetadata.parse({ defaultInPersonAddress: "  Example street 12, Vienna  " });
    expect(updateUserMetadataAllowedKeys.parse(metadata)).toEqual({
      defaultInPersonAddress: "Example street 12, Vienna",
    });
  });
  it("allows clearing the address and rejects oversized input", () => {
    expect(studioAddressSchema.parse("  ")).toBe("");
    expect(studioAddressSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
  it("offers separate saved and manual choices while preserving attendee locations", () => {
    const choices = buildStudioLocationOptions(options, " Example street 12 ", (key) => key);
    expect(choices).toHaveLength(3);
    expect(getStudioLocationAddress(choices[0])).toEqual({ address: "Example street 12" });
    expect(getStudioLocationAddress(choices[1])).toEqual({ address: "" });
    expect(choices[2]).toEqual(options[1]);
    expect(getStudioLocationAddress(choices[2])).toEqual({});
  });
  it("disables the saved choice when no profile address is available", () => {
    const choices = buildStudioLocationOptions(options, "  ", (key) => key);
    expect(choices[0].disabled).toBe(true);
    expect(choices[1].disabled).toBeUndefined();
  });
});
