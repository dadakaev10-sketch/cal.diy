import { createHmac } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";

const unavailable = () => ErrorWithCode.Factory.InternalServerError("Billing unavailable");
export function paypalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const planId = process.env.PAYPAL_PLAN_ID;
  if (!clientId || !secret || !planId) throw unavailable();
  return {
    clientId,
    secret,
    planId,
    base:
      process.env.PAYPAL_ENVIRONMENT === "sandbox"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com",
  };
}
export async function paypalRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const config = paypalConfig();
  const tokenResponse = await fetch(`${config.base}/v1/oauth2/token`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) throw unavailable();
  const token = z.object({ access_token: z.string() }).parse(await tokenResponse.json());
  const result = await fetch(`${config.base}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
  });
  if (!result.ok) throw unavailable();
  return result.status === 204 ? {} : result.json();
}
export function accountReference(userId: number) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw unavailable();
  return createHmac("sha256", secret).update(`fixmit-paypal:${userId}`).digest("hex");
}
