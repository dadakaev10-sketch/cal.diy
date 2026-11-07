import { studioAccountRateLimit } from "@calcom/features/auth/lib/studioAccountSecurity";
import {
  assertSocialVerifier,
  identityProof,
  readSocialProof,
  socialError,
  socialProvider,
} from "@calcom/features/auth/lib/studioSocialIdentity";
import { socialSessionClaim } from "@calcom/features/auth/lib/studioSocialSession";
import { deleteUser } from "@calcom/features/users/lib/deleteUser";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";
import {
  cancelIdentity,
  exchangeIdentity,
  methods,
  onboardSocial,
  socialOnboardInput,
  unlink,
} from "@lib/studioSocial/account";
import { finishProvider, options, startProvider } from "@lib/studioSocial/provider";
import { actor } from "@lib/studioSocial/session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
export const runtime = "nodejs";
type Context = { params: Promise<{ action: string }> };
const response = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const proofInput = z
  .object({
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
    verifier: z.string().max(128),
    totp: z.string().max(32).optional(),
    backup: z.string().max(128).optional(),
  })
  .strict();
const startInput = z
  .object({
    provider: socialProvider,
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    mode: z.enum(["login", "link", "reauth"]).default("login"),
  })
  .strict();
const finishInput = z
  .object({
    state: z.string().regex(/^[a-f0-9]{64}$/),
    verifier: z.string().max(128),
    code: z.string().min(1).max(4096),
    idToken: z.string().max(16384).optional(),
    name: z.string().max(160).optional(),
    totp: z.string().max(32).optional(),
    backup: z.string().max(128).optional(),
  })
  .strict();
function failed(error: unknown) {
  if (error instanceof z.ZodError) return response({ error: "invalid_input" }, 400);
  if (error instanceof ErrorWithCode) {
    const known = new Set([
      "signin_required",
      "registration_disabled",
      "reauth_required",
      "wrong_account",
      "identity_already_linked",
      "provider_already_linked",
      "identity_not_linked",
      "verified_email_required",
      "last_signin_method",
      "social_proof_expired",
      "invalid_social_proof",
      "invalid_second_factor",
      "second_factor_required",
      "password_login_required",
      "request_is_expired",
      "studio_slug_unavailable",
      "apple_credentials_revoked",
      "social_signin_failed",
    ]);
    if (known.has(error.message))
      return response({ error: error.message }, error.message === "signin_required" ? 401 : 409);
  }
  return response({ error: "social_auth_unavailable" }, 503);
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { action } = await context.params;
    if (action === "options") return response(options());
    if (action === "methods") return await methods(request);
    return response({ error: "not_found" }, 404);
  } catch (error) {
    return failed(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { action } = await context.params;
    if (request.headers.get("origin") !== new URL(WEBAPP_URL).origin)
      return response({ error: "forbidden" }, 403);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await studioAccountRateLimit(`social-${action}`, ip, 20)))
      return response({ error: "rate_limited" }, 429);
    const text = await request.text();
    if (text.length > 32768) return response({ error: "invalid_input" }, 400);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return response({ error: "invalid_input" }, 400);
    }
    if (action === "start") {
      const input = startInput.parse(body);
      const current = input.mode === "login" ? undefined : await actor(request, input.mode === "link");
      return response(await startProvider(input.provider, input.challenge, input.mode, current?.user.id));
    }
    if (action === "finish") {
      const input = finishInput.parse(body);
      const ticket = await finishProvider(input);
      return await exchangeIdentity(request, {
        ticket,
        verifier: input.verifier,
        totp: input.totp,
        backup: input.backup,
      });
    }
    if (action === "exchange") return await exchangeIdentity(request, proofInput.parse(body));
    if (action === "onboard") return await onboardSocial(socialOnboardInput.parse(body));
    if (action === "cancel") {
      const input = proofInput.parse(body);
      return await cancelIdentity(input.ticket, input.verifier);
    }
    if (action === "unlink")
      return await unlink(request, z.object({ provider: socialProvider }).strict().parse(body).provider);
    if (action === "revoked") {
      z.object({}).strict().parse(body);
      const current = await actor(request);
      const claim = socialSessionClaim.parse(current.token.studioSocial);
      if (claim.provider !== "apple") return socialError("invalid_social_proof");
      await prisma.account.updateMany({
        where: { userId: current.user.id, provider: "studio-apple", providerAccountId: claim.sub },
        data: { refresh_token: null, expires_at: 0 },
      });
      return response({ status: "revoked" });
    }
    if (action === "delete") {
      z.object({}).strict().parse(body);
      const current = await actor(request, true);
      if (
        !current.token.studioSocial ||
        typeof current.token.studioSocialReauthenticatedAt !== "number" ||
        Date.now() / 1000 - current.token.studioSocialReauthenticatedAt > 300
      )
        return socialError("reauth_required");
      await deleteUser(current.user);
      const out = response({ status: "deleted" });
      out.cookies.set("__Secure-next-auth.session-token", "", {
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return out;
    }
    return response({ error: "not_found" }, 404);
  } catch (error) {
    return failed(error);
  }
}
