import { randomBytes } from "node:crypto";
import process from "node:process";
import { appleClientId, appleReady, appleRequest } from "@calcom/features/auth/lib/studioApple";
import {
  assertSocialVerifier,
  consumeSocialProof,
  createSocialProof,
  identityProof,
  oauthState,
  readSocialProof,
  type SocialProvider,
  sealSocial,
  socialError,
} from "@calcom/features/auth/lib/studioSocialIdentity";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
export function googleClient() {
  const id = process.env.GOOGLE_IOS_CLIENT_ID;
  if (!id || !/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(id)) return null;
  return { id, scheme: `com.googleusercontent.apps.${id.split(".apps.")[0]}` };
}
export const options = () => ({
  google: !!googleClient(),
  apple: appleReady(),
  googleScheme: googleClient()?.scheme,
});
export async function startProvider(
  provider: SocialProvider,
  challenge: string,
  mode: "login" | "link" | "reauth",
  actor?: number
) {
  const state = oauthState.parse({
    provider,
    challenge,
    mode,
    actor,
    nonce: randomBytes(32).toString("hex"),
  });
  if ((provider === "apple" && !appleReady()) || (provider === "google" && !googleClient()))
    return socialError("social_auth_unavailable");
  const token = await createSocialProof("state", state, 10);
  if (provider === "apple") return { state: token, nonce: state.nonce };
  const client = googleClient()!;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: `${client.scheme}:/oauthredirect`,
    response_type: "code",
    scope: "openid email profile",
    state: token,
    nonce: state.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { state: token, authorizationURL: url.href, callbackScheme: client.scheme };
}
export async function finishProvider(input: {
  state: string;
  verifier: string;
  code: string;
  idToken?: string;
  name?: string;
}) {
  const { row, data: state } = await readSocialProof(input.state, "state", oauthState);
  assertSocialVerifier(state.challenge, input.verifier);
  let idToken = input.idToken,
    refresh: string | undefined;
  if (state.provider === "google") {
    const client = googleClient();
    if (!client) return socialError("social_auth_unavailable");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.id,
        code: input.code,
        code_verifier: input.verifier,
        redirect_uri: `${client.scheme}:/oauthredirect`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return socialError("social_signin_failed");
    idToken = z.object({ id_token: z.string() }).parse(await response.json()).id_token;
  }
  if (!idToken) return socialError("social_signin_failed");
  const { payload } = await jwtVerify(idToken, state.provider === "apple" ? appleKeys : googleKeys, {
    algorithms: ["RS256"],
    issuer:
      state.provider === "apple"
        ? "https://appleid.apple.com"
        : ["https://accounts.google.com", "accounts.google.com"],
    audience: state.provider === "apple" ? appleClientId() : googleClient()!.id,
    clockTolerance: 10,
    maxTokenAge: "10m",
  });
  if (payload.nonce !== state.nonce || !payload.sub) return socialError("invalid_social_proof");
  const verified =
    payload.email_verified === true || (state.provider === "apple" && payload.email_verified === "true");
  const email = verified && typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  if (state.provider === "apple") {
    const result = z
      .object({ refresh_token: z.string(), id_token: z.string() })
      .passthrough()
      .parse(await appleRequest("token", { grant_type: "authorization_code", code: input.code }));
    const exchanged = await jwtVerify(result.id_token, appleKeys, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      audience: appleClientId(),
      clockTolerance: 10,
    });
    if (
      exchanged.payload.sub !== payload.sub ||
      (exchanged.payload.nonce !== undefined && exchanged.payload.nonce !== state.nonce)
    )
      return socialError("invalid_social_proof");
    refresh = sealSocial(result.refresh_token);
  }
  await consumeSocialProof(row);
  const identity = {
    provider: state.provider,
    sub: payload.sub,
    email,
    name: input.name || (typeof payload.name === "string" ? payload.name : undefined),
    refresh,
  };
  return await createSocialProof("identity", identityProof.parse({ ...state, identity }), 15);
}
