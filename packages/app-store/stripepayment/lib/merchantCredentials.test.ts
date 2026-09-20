import { describe, expect, it } from "vitest";
import { decryptMerchantStripeCredentials, encryptMerchantStripeCredentials } from "./merchantCredentials";

const key = "ab".repeat(32);
const scope = { teamId: 1, connectionId: "60fe20f0-ded5-4d93-a75c-a1f4f85f08e7" };
const credentials = {
  mode: "test",
  accountId: "acct_fixture",
  publishableKey: "pk_test_fixture",
  restrictedKey: "rk_test_fixture",
  webhookSecret: "whsec_fixture",
};

describe("merchant Stripe credentials", () => {
  it("round-trips without storing plaintext keys", () => {
    const sealed = encryptMerchantStripeCredentials(scope, credentials, key);
    expect(JSON.stringify(sealed)).not.toContain(credentials.restrictedKey);
    expect(JSON.stringify(sealed)).not.toContain(credentials.webhookSecret);
    expect(decryptMerchantStripeCredentials(scope, sealed, key)).toEqual(credentials);
  });

  it("randomizes ciphertext for identical credentials", () => {
    expect(encryptMerchantStripeCredentials(scope, credentials, key)).not.toEqual(
      encryptMerchantStripeCredentials(scope, credentials, key)
    );
  });

  it.each([
    { ...scope, teamId: 2 },
    { ...scope, connectionId: "50fe20f0-ded5-4d93-a75c-a1f4f85f08e7" },
  ])("rejects copied credentials for another scope", (otherScope) => {
    const sealed = encryptMerchantStripeCredentials(scope, credentials, key);
    expect(() => decryptMerchantStripeCredentials(otherScope, sealed, key)).toThrow("unavailable");
  });

  it("rejects a different encryption key", () => {
    const sealed = encryptMerchantStripeCredentials(scope, credentials, key);
    expect(() => decryptMerchantStripeCredentials(scope, sealed, "cd".repeat(32))).toThrow("unavailable");
  });

  it.each(["iv", "tag", "ciphertext"] as const)("rejects tampered %s", (field) => {
    const sealed = encryptMerchantStripeCredentials(scope, credentials, key);
    const tampered = {
      ...sealed,
      [field]: `${sealed[field][0] === "0" ? "1" : "0"}${sealed[field].slice(1)}`,
    };
    expect(() => decryptMerchantStripeCredentials(scope, tampered, key)).toThrow("unavailable");
  });

  it.each([
    { ...credentials, mode: "live" },
    { ...credentials, restrictedKey: "rk_live_fixture" },
    { ...credentials, restrictedKey: "sk_test_fixture" },
    { ...credentials, publishableKey: "pk_live_fixture" },
    { ...credentials, webhookSecret: "" },
    { ...credentials, accountId: "" },
  ])("rejects invalid or unrestricted connection details", (input) => {
    expect(() => encryptMerchantStripeCredentials(scope, input, key)).toThrow("test-mode restricted");
  });

  it("fails closed when the dedicated encryption key is absent", () => {
    expect(() => encryptMerchantStripeCredentials(scope, credentials, "")).toThrow("not configured");
  });

  it("rejects invalid studio scope", () => {
    expect(() => encryptMerchantStripeCredentials({ ...scope, teamId: 0 }, credentials, key)).toThrow(
      "scope"
    );
  });

  it("redacts malformed envelope errors", () => {
    expect(() => decryptMerchantStripeCredentials(scope, credentials, key)).toThrow(
      "Merchant Stripe connection is unavailable"
    );
  });
});
