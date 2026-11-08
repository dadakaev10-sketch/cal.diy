import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";

export const restrictedSecrets = z.object({
  apiKey: z.string().regex(/^rk_(test|live)_[A-Za-z0-9]+$/),
  webhookSecret: z.string().startsWith("whsec_"),
});
function key() {
  const secret = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!secret || secret.length < 32)
    throw ErrorWithCode.Factory.InternalServerError("stripe_vault_unavailable");
  return createHash("sha256").update(`fixmit-stripe-v1:${secret}`).digest();
}
const aad = (owner: number, account: string) => Buffer.from(`stripe:${owner}:${account}`);
export function sealStripe(value: z.infer<typeof restrictedSecrets>, owner: number, account: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(owner, account));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(restrictedSecrets.parse(value)), "utf8"),
    cipher.final(),
  ]);
  return [
    "fixmit-stripe-v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function openStripe(value: string, owner: number, account: string) {
  try {
    const [version, iv, tag, data, extra] = value.split(".");
    if (version !== "fixmit-stripe-v1" || extra || !iv || !tag || !data) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    cipher.setAAD(aad(owner, account));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return restrictedSecrets.parse(
      JSON.parse(
        Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8")
      )
    );
  } catch {
    throw ErrorWithCode.Factory.Forbidden("stripe_account_unavailable");
  }
}
