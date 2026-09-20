import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";

const scopeSchema = z.object({
  teamId: z.number().int().positive(),
  connectionId: z.string().uuid(),
});
export type MerchantStripeScope = z.infer<typeof scopeSchema>;

const credentialsSchema = z
  .object({
    mode: z.literal("test"),
    accountId: z.string().regex(/^acct_[a-zA-Z0-9]+$/),
    publishableKey: z.string().regex(/^pk_test_[a-zA-Z0-9]+$/),
    restrictedKey: z.string().regex(/^rk_test_[a-zA-Z0-9]+$/),
    webhookSecret: z
      .string()
      .regex(/^whsec_[a-zA-Z0-9]+$/)
      .optional(),
  })
  .strict();
export type MerchantStripeCredentials = z.infer<typeof credentialsSchema>;

const envelopeSchema = z
  .object({
    version: z.literal(1),
    iv: z.string().regex(/^[a-f0-9]{24}$/),
    tag: z.string().regex(/^[a-f0-9]{32}$/),
    ciphertext: z
      .string()
      .min(2)
      .max(32768)
      .regex(/^(?:[a-f0-9]{2})+$/),
  })
  .strict();
export type EncryptedMerchantStripeCredentials = z.infer<typeof envelopeSchema>;

function encryptionKey(key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new ErrorWithCode(ErrorCode.InternalServerError, "Merchant encryption key is not configured");
  }
  return Buffer.from(key, "hex");
}

function associatedData(scope: MerchantStripeScope) {
  const parsed = scopeSchema.safeParse(scope);
  if (!parsed.success) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "Invalid merchant connection scope");
  }
  return Buffer.from(`merchant-stripe:v1:${parsed.data.teamId}:${parsed.data.connectionId}:test`);
}

export function encryptMerchantStripeCredentials(
  scope: MerchantStripeScope,
  credentials: unknown,
  key: string
): EncryptedMerchantStripeCredentials {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    throw new ErrorWithCode(ErrorCode.BadRequest, "A test-mode restricted Stripe connection is required");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  // Bind ciphertext to its studio and immutable connection, so copied records cannot be reused elsewhere.
  cipher.setAAD(associatedData(scope));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed.data), "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
}

export function decryptMerchantStripeCredentials(
  scope: MerchantStripeScope,
  envelope: unknown,
  key: string
): MerchantStripeCredentials {
  const masterKey = encryptionKey(key);
  const aad = associatedData(scope);
  try {
    const parsed = envelopeSchema.parse(envelope);
    const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(parsed.iv, "hex"));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(parsed.tag, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, "hex")),
      decipher.final(),
    ]);
    return credentialsSchema.parse(JSON.parse(plaintext.toString("utf8")));
  } catch {
    // Do not forward parser or provider errors that could contain secret input values.
    throw new ErrorWithCode(ErrorCode.MissingPaymentCredential, "Merchant Stripe connection is unavailable");
  }
}
