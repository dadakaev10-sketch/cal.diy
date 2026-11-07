import { randomBytes } from "node:crypto";
import { studioAccountRateLimit } from "@calcom/features/auth/lib/studioAccountSecurity";
import {
  consumeSocialProof,
  createSocialProof,
  identityProof,
  oauthState,
  openSocial,
  proofHash,
  readSocialProof,
  sealSocial,
  socialError,
  socialProvider,
} from "@calcom/features/auth/lib/studioSocialIdentity";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorWithCode } from "@calcom/lib/errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cancelIdentity, exchangeIdentity, onboardSocial, socialOnboardInput } from "./account";
import { finishProvider, startProvider, webOptions } from "./provider";
import { actor } from "./session";

const origin = new URL(WEBAPP_URL).origin;
const flowCookie = "__Host-fixmit-oauth";
const resumeCookie = "__Host-fixmit-social";
const binding = z
  .object({
    state: z.string().regex(/^[a-f0-9]{64}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  })
  .strict();
const resume = z
  .object({
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  })
  .strict();
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
const redirect = (path: string) =>
  NextResponse.redirect(new URL(path, origin), {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
function readCookie<T>(req: NextRequest, name: string, schema: z.ZodType<T>) {
  const value = req.cookies.get(name)?.value;
  if (!value) return socialError("social_proof_expired");
  return schema.parse(JSON.parse(openSocial(value)));
}
function setResume(out: NextResponse, value: z.infer<typeof resume>) {
  out.cookies.set(resumeCookie, sealSocial(JSON.stringify(value)), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
}
function clearCookie(out: NextResponse, name: string) {
  out.cookies.set(name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}
function finalResponse(result: NextResponse, path = "/event-types") {
  const out = redirect(path);
  for (const cookie of result.cookies.getAll()) out.cookies.set(cookie);
  clearCookie(out, resumeCookie);
  clearCookie(out, flowCookie);
  return out;
}
export async function webCallback(req: NextRequest, provider: string) {
  try {
    const selected = socialProvider.parse(provider);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await studioAccountRateLimit("web-social-callback", ip, 30))) return cancelled();
    let params =
      req.method === "POST" ? new URLSearchParams(await limitedText(req)) : new URL(req.url).searchParams;
    let handoff: { token: string; identifier: string } | undefined;
    if (req.method === "GET" && params.has("handoff")) {
      const saved = await readSocialProof(
        params.get("handoff")!,
        "web-callback",
        z.object({ provider: socialProvider, body: z.string().max(32768) })
      );
      if (saved.data.provider !== selected) return socialError("invalid_social_proof");
      params = new URLSearchParams(saved.data.body);
      handoff = saved.row;
    }
    const flow = readCookie(req, flowCookie, binding);
    if (params.get("state") !== flow.state) return socialError("invalid_social_proof");
    const { data } = await readSocialProof(flow.state, "state", oauthState);
    if (data.surface !== "web" || data.provider !== selected) return socialError("invalid_social_proof");
    if (params.has("error")) return cancelled();
    if (req.method === "POST") {
      // Apple posts cross-site; return to a same-site GET before checking the existing account session.
      const ticket = await createSocialProof(
        "web-callback",
        { provider: selected, body: params.toString() },
        1
      );
      return redirect(`/api/studio-web-auth/callback/${selected}?handoff=${ticket}`);
    }
    if (handoff) await consumeSocialProof(handoff);
    const code = z.string().min(1).max(4096).parse(params.get("code"));
    const idToken = params.get("id_token") || undefined;
    if (idToken && idToken.length > 16384) return socialError("invalid_social_proof");
    let name: string | undefined;
    const rawUser = params.get("user");
    if (rawUser) {
      const user = z
        .object({
          name: z
            .object({ firstName: z.string().max(80).optional(), lastName: z.string().max(80).optional() })
            .optional(),
        })
        .passthrough()
        .parse(JSON.parse(rawUser));
      name = [user.name?.firstName, user.name?.lastName].filter(Boolean).join(" ") || undefined;
    }
    const ticket = await finishProvider({ state: flow.state, verifier: flow.verifier, code, idToken, name });
    const result = await exchangeIdentity(req, { ticket, verifier: flow.verifier });
    const body = await result.json();
    if (body.status === "signed_in")
      return finalResponse(
        result,
        data.mode === "reauth"
          ? data.intent === "link"
            ? "/auth/social?link=1"
            : "/auth/social?delete=1"
          : "/event-types"
      );
    if (body.status === "linked") return finalResponse(result, "/auth/social?linked=1");
    if (body.status === "account_link_required") {
      const out = redirect("/auth/social?error=account_link_required");
      clearCookie(out, flowCookie);
      return out;
    }
    const out = redirect("/auth/social");
    setResume(out, { ticket, verifier: flow.verifier });
    clearCookie(out, flowCookie);
    return out;
  } catch {
    return cancelled();
  }
}
function cancelled() {
  const out = redirect("/auth/social?error=signin_failed");
  clearCookie(out, flowCookie);
  clearCookie(out, resumeCookie);
  return out;
}
async function limitedText(req: NextRequest) {
  const text = await req.text();
  if (text.length > 32768) return socialError("invalid_social_proof");
  return text;
}
export async function webGet(req: NextRequest, action: string) {
  if (action === "options") return json(webOptions());
  if (action !== "status") return json({ error: "not_found" }, 404);
  try {
    const input = readCookie(req, resumeCookie, resume);
    const { data } = await readSocialProof(input.ticket, "identity", identityProof);
    if (data.surface !== "web" || data.challenge !== proofHash(input.verifier))
      return socialError("invalid_social_proof");
    const result = await exchangeIdentity(req, input);
    const body = await result.json();
    // A successful retry may return an authenticated cookie; preserve it for the browser.
    if (body.status === "signed_in") {
      result.headers.set(
        "X-Fixmit-Destination",
        data.mode === "reauth"
          ? data.intent === "link"
            ? "/auth/social?link=1"
            : "/auth/social?delete=1"
          : "/event-types"
      );
      return result;
    }
    return json({ status: body.status, email: body.email, name: body.name });
  } catch {
    return json({ error: "social_proof_expired" }, 409);
  }
}
export async function webPost(req: NextRequest, action: string) {
  try {
    if (req.headers.get("origin") !== origin) return json({ error: "forbidden" }, 403);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await studioAccountRateLimit(`web-social-${action}`, ip, 20)))
      return json({ error: "rate_limited" }, 429);
    const body: unknown = JSON.parse(await limitedText(req));
    if (action === "start") {
      const input = z
        .object({
          provider: socialProvider,
          mode: z.enum(["login", "link", "reauth"]).default("login"),
          intent: z.enum(["link", "delete"]).optional(),
        })
        .strict()
        .parse(body);
      const current = input.mode === "login" ? undefined : await actor(req, input.mode === "link");
      const verifier = randomBytes(32).toString("base64url");
      const flow = await startProvider(
        input.provider,
        proofHash(verifier),
        input.mode,
        current?.user.id,
        "web",
        input.intent
      );
      const out = json({ authorizationURL: flow.authorizationURL });
      clearCookie(out, resumeCookie);
      out.cookies.set(flowCookie, sealSocial(JSON.stringify({ state: flow.state, verifier })), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 600,
      });
      return out;
    }
    const saved = readCookie(req, resumeCookie, resume);
    const { data } = await readSocialProof(saved.ticket, "identity", identityProof);
    if (data.surface !== "web") return socialError("invalid_social_proof");
    let result: NextResponse;
    if (action === "cancel") result = await cancelIdentity(saved.ticket, saved.verifier);
    else if (action === "exchange") {
      const factor = z
        .object({ totp: z.string().max(32).optional(), backup: z.string().max(128).optional() })
        .strict()
        .parse(body);
      result = await exchangeIdentity(req, { ...saved, ...factor });
    } else if (action === "onboard") {
      const input = socialOnboardInput
        .omit({ ticket: true, verifier: true })
        .extend({ acceptedTerms: z.literal(true) })
        .strict()
        .parse(body);
      const { acceptedTerms, ...fields } = input;
      result = await onboardSocial({ ...fields, ...saved });
    } else return json({ error: "not_found" }, 404);
    const resultBody = await result.clone().json();
    if (["signed_in", "cancelled", "linked"].includes(resultBody.status)) {
      clearCookie(result, resumeCookie);
      if (resultBody.status === "signed_in")
        result.headers.set(
          "X-Fixmit-Destination",
          data.mode === "reauth"
            ? data.intent === "link"
              ? "/auth/social?link=1"
              : "/auth/social?delete=1"
            : "/event-types"
        );
      return result;
    }
    return json({ status: resultBody.status, email: resultBody.email, name: resultBody.name });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "invalid_input" }, 400);
    const safe = new Set([
      "signin_required",
      "reauth_required",
      "invalid_second_factor",
      "second_factor_required",
      "studio_slug_unavailable",
      "registration_disabled",
      "identity_already_linked",
      "provider_already_linked",
      "wrong_account",
      "identity_not_linked",
      "verified_email_required",
      "social_proof_expired",
      "last_signin_method",
    ]);
    return json(
      {
        error:
          error instanceof ErrorWithCode && safe.has(error.message)
            ? error.message
            : "social_auth_unavailable",
      },
      409
    );
  }
}
