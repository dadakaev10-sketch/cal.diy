// @vitest-environment node

import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  limit: vi.fn(),
  start: vi.fn(),
  finish: vi.fn(),
  exchange: vi.fn(),
  onboard: vi.fn(),
  cancel: vi.fn(),
  actor: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  consume: vi.fn(),
}));
vi.mock("@calcom/prisma", () => ({ default: {} }));
vi.mock("@calcom/lib/constants", async (original) => ({
  ...(await original<typeof import("@calcom/lib/constants")>()),
  WEBAPP_URL: "https://fixmit.com",
}));
vi.mock("@calcom/features/auth/lib/studioAccountSecurity", async (original) => ({
  ...(await original<typeof import("@calcom/features/auth/lib/studioAccountSecurity")>()),
  studioAccountRateLimit: m.limit,
}));
vi.mock("@calcom/features/auth/lib/studioSocialIdentity", async (original) => ({
  ...(await original<typeof import("@calcom/features/auth/lib/studioSocialIdentity")>()),
  readSocialProof: m.read,
  createSocialProof: m.create,
  consumeSocialProof: m.consume,
}));
vi.mock("./provider", () => ({
  webOptions: () => ({ apple: true, google: true }),
  startProvider: m.start,
  finishProvider: m.finish,
}));
vi.mock("./session", () => ({ actor: m.actor }));
vi.mock("./account", async (original) => ({
  ...(await original<typeof import("./account")>()),
  exchangeIdentity: m.exchange,
  onboardSocial: m.onboard,
  cancelIdentity: m.cancel,
}));

import { openSocial, proofHash, sealSocial } from "@calcom/features/auth/lib/studioSocialIdentity";
import { webCallback, webGet, webPost } from "./web";

const state = "f".repeat(64),
  ticket = "e".repeat(64),
  verifier = "v".repeat(43);
const cookie = (name: string, value: unknown) => `${name}=${sealSocial(JSON.stringify(value))}`;
const flow = () => cookie("__Host-fixmit-oauth", { state, verifier });
const saved = () => cookie("__Host-fixmit-social", { ticket, verifier });
function req(path: string, body?: unknown, origin = "https://fixmit.com", cookies = "") {
  return new NextRequest(`https://fixmit.com/api/studio-web-auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, cookie: cookies },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CALENDSO_ENCRYPTION_KEY", "web-social-test-fixture");
  m.limit.mockResolvedValue(true);
  m.start.mockResolvedValue({ state, authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth" });
  m.finish.mockResolvedValue(ticket);
  m.create.mockResolvedValue("a".repeat(64));
  m.actor.mockResolvedValue({ user: { id: 9 } });
  m.read.mockImplementation(async (_token, kind) => ({
    row: { token: "hash", identifier: "encrypted" },
    data:
      kind === "web-callback"
        ? {
            provider: "apple",
            body: new URLSearchParams({ state, code: "code", id_token: "signed-token" }).toString(),
          }
        : { surface: "web", provider: "google", challenge: proofHash(verifier), mode: "login" },
  }));
  m.exchange.mockImplementation(async () =>
    NextResponse.json({ status: "onboarding_required", ticket, email: "test@example.invalid", name: "Test" })
  );
});
describe("browser OAuth security boundaries", () => {
  it("exposes booleans only", async () =>
    expect(await (await webGet(req("options"), "options")).json()).toEqual({ apple: true, google: true }));
  it("rejects cross-site start", async () => {
    expect(
      (await webPost(req("start", { provider: "google" }, "https://evil.invalid"), "start")).status
    ).toBe(403);
    expect(m.start).not.toHaveBeenCalled();
  });
  it("binds the server PKCE verifier to an encrypted HttpOnly host cookie", async () => {
    const r = await webPost(req("start", { provider: "google" }), "start");
    const c = r.cookies.get("__Host-fixmit-oauth")!;
    const v = JSON.parse(openSocial(c.value));
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 600 });
    expect(m.start).toHaveBeenCalledWith(
      "google",
      proofHash(v.verifier),
      "login",
      undefined,
      "web",
      undefined
    );
    expect(await r.json()).not.toHaveProperty("verifier");
  });
  it("requires current fresh identity to link a provider", async () => {
    await webPost(req("start", { provider: "google", mode: "link" }), "start");
    expect(m.actor).toHaveBeenCalledWith(expect.anything(), true);
    expect(m.start).toHaveBeenCalledWith("google", expect.any(String), "link", 9, "web", undefined);
  });
  it("rejects a body-selected actor", async () =>
    expect((await webPost(req("start", { provider: "google", actor: 999 }), "start")).status).toBe(400));
  it("enforces the mutation limit", async () => {
    m.limit.mockResolvedValue(false);
    expect((await webPost(req("start", { provider: "google" }), "start")).status).toBe(429);
  });
  it("rejects callbacks without the matching browser cookie", async () => {
    const r = await webCallback(req(`callback/google?state=${state}&code=x`), "google");
    expect(r.headers.get("location")).toContain("error=signin_failed");
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("rejects changed state and wrong provider", async () => {
    await webCallback(
      req(`callback/google?state=${"a".repeat(64)}&code=x`, undefined, undefined, flow()),
      "google"
    );
    await webCallback(req(`callback/apple?state=${state}&code=x`, undefined, undefined, flow()), "apple");
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("rejects a native proof on the web callback", async () => {
    m.read.mockResolvedValue({ data: { surface: "native", provider: "google" } });
    await webCallback(req(`callback/google?state=${state}&code=x`, undefined, undefined, flow()), "google");
    expect(m.finish).not.toHaveBeenCalled();
  });
  it("moves onboarding proof to a secure cookie, never the redirect URL", async () => {
    const r = await webCallback(
      req(`callback/google?state=${state}&code=x`, undefined, undefined, flow()),
      "google"
    );
    expect(r.headers.get("location")).toBe("https://fixmit.com/auth/social");
    expect(r.cookies.get("__Host-fixmit-social")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(m.finish).toHaveBeenCalledWith(expect.objectContaining({ state, verifier, code: "x" }));
  });
  it("keeps the session cookie and uses a fixed success destination", async () => {
    m.exchange.mockImplementation(async () => {
      const r = NextResponse.json({ status: "signed_in" });
      r.cookies.set("__Secure-next-auth.session-token", "fixture-session", { httpOnly: true, secure: true });
      return r;
    });
    const r = await webCallback(
      req(
        `callback/google?state=${state}&code=x&returnTo=https://evil.invalid`,
        undefined,
        undefined,
        flow()
      ),
      "google"
    );
    expect(r.headers.get("location")).toBe("https://fixmit.com/event-types");
    expect(r.cookies.get("__Secure-next-auth.session-token")?.value).toBe("fixture-session");
  });
  it("returns Apple form_post through a same-site one-time handoff before session checks", async () => {
    m.read.mockResolvedValue({ data: { surface: "web", provider: "apple" } });
    const r = await webCallback(
      new NextRequest("https://fixmit.com/api/studio-web-auth/callback/apple", {
        method: "POST",
        headers: { cookie: flow() },
        body: new URLSearchParams({ state, code: "private-code", id_token: "private-token" }),
      }),
      "apple"
    );
    expect(r.headers.get("location")).toBe(
      `https://fixmit.com/api/studio-web-auth/callback/apple?handoff=${"a".repeat(64)}`
    );
    expect(m.create).toHaveBeenCalledWith("web-callback", expect.anything(), 1);
    expect(m.exchange).not.toHaveBeenCalled();
  });
  it("requires matching PKCE binding on resume", async () => {
    m.read.mockResolvedValue({ data: { surface: "web", challenge: proofHash("z".repeat(43)) } });
    expect((await webGet(req("status", undefined, undefined, saved()), "status")).status).toBe(409);
    expect(m.exchange).not.toHaveBeenCalled();
  });
  it("does not complete registration without explicit terms acceptance", async () => {
    expect(
      (
        await webPost(
          req(
            "onboard",
            { name: "Test", studioName: "Test Studio", slug: "test-studio", timeZone: "Europe/Vienna" },
            undefined,
            saved()
          ),
          "onboard"
        )
      ).status
    ).toBe(400);
    expect(m.onboard).not.toHaveBeenCalled();
  });
  it("does not accept browser-selected proof or user IDs", async () => {
    expect(
      (await webPost(req("exchange", { ticket, userId: 999 }, undefined, saved()), "exchange")).status
    ).toBe(400);
    expect(m.exchange).not.toHaveBeenCalled();
  });
});
describe("browser completion never exposes identity credentials", () => {
  it("omits proof tickets from onboarding status", async () => {
    m.read.mockResolvedValue({ data: { surface: "web", challenge: proofHash(verifier) } });
    const result = await webGet(req("status", undefined, undefined, saved()), "status");
    const body = await result.json();
    expect(body.status).toBe("onboarding_required");
    expect(body).not.toHaveProperty("ticket");
    expect(JSON.stringify(body)).not.toContain(verifier);
  });
  it("omits proof tickets after an MFA retry", async () => {
    m.exchange.mockImplementation(async () => NextResponse.json({ status: "two_factor_required", ticket }));
    const result = await webPost(req("exchange", { totp: "123456" }, undefined, saved()), "exchange");
    expect(await result.json()).toEqual({ status: "two_factor_required" });
  });
  it("consumes Apple's one-time handoff only after checking the same browser and provider", async () => {
    m.read.mockImplementation(async (_token, kind) => ({
      row: { token: "handoff-hash", identifier: "stored" },
      data:
        kind === "web-callback"
          ? {
              provider: "apple",
              body: new URLSearchParams({ state, code: "apple-code", id_token: "signed" }).toString(),
            }
          : { surface: "web", provider: "apple", challenge: proofHash(verifier) },
    }));
    await webCallback(req(`callback/apple?handoff=${"a".repeat(64)}`, undefined, undefined, flow()), "apple");
    expect(m.consume).toHaveBeenCalledWith({ token: "handoff-hash", identifier: "stored" });
    expect(m.finish).toHaveBeenCalledWith(expect.objectContaining({ code: "apple-code", verifier }));
  });
});
describe("web reauthentication stays bound to its purpose",()=>{
 it.each([["link","/auth/social?link=1"],["delete","/auth/social?delete=1"]])("returns %s verification to its fixed confirmation page",async(intent,path)=>{
  m.read.mockResolvedValue({data:{surface:"web",provider:"google",mode:"reauth",intent,challenge:proofHash(verifier)}});
  m.exchange.mockImplementation(async()=>NextResponse.json({status:"signed_in"}));
  const result=await webCallback(req(`callback/google?state=${state}&code=x`,undefined,undefined,flow()),"google");expect(result.headers.get("location")).toBe(`https://fixmit.com${path}`);
 });
 it("clears host-prefixed cookies with Secure and the matching root path",async()=>{
  const result=await webCallback(req(`callback/google?state=${state}&code=x`,undefined,undefined,flow()),"google");expect(result.cookies.get("__Host-fixmit-oauth")).toMatchObject({value:"",secure:true,httpOnly:true,path:"/",maxAge:0});
 });
 it("only sets the redirect hint after successful MFA reauthentication",async()=>{
  m.read.mockResolvedValue({data:{surface:"web",mode:"reauth",intent:"delete",challenge:proofHash(verifier)}});m.exchange.mockImplementation(async()=>NextResponse.json({status:"two_factor_required",ticket}));
  const denied=await webPost(req("exchange",{totp:"wrong"},undefined,saved()),"exchange");expect(denied.headers.has("X-Fixmit-Destination")).toBe(false);
  m.exchange.mockImplementation(async()=>{const r=NextResponse.json({status:"signed_in"});r.cookies.set("__Secure-next-auth.session-token","fixture-session",{secure:true,httpOnly:true});return r});
  const result=await webPost(req("exchange",{totp:"123456"},undefined,saved()),"exchange");expect(result.headers.get("X-Fixmit-Destination")).toBe("/auth/social?delete=1");expect(result.cookies.get("__Secure-next-auth.session-token")?.value).toBe("fixture-session");
 });
});
