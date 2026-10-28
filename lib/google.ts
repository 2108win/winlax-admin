import { createHash } from "node:crypto";

import { env, publicUrl } from "./env";

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function googleAuthUrl(state: string, verifier: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: publicUrl(GOOGLE_CALLBACK_PATH).toString(),
    response_type: "code",
    scope: "openid email",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
    login_hint: env.adminEmail,
  }).toString();
  return url.toString();
}

type IdTokenClaims = {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
};

/**
 * Exchanges the code at Google's token endpoint and returns the verified email.
 * The ID token comes straight from Google over TLS, so (per OIDC core 3.1.3.7)
 * its claims are checked without verifying the signature.
 */
export async function verifiedEmailFromCode(
  code: string,
  verifier: string,
): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: publicUrl(GOOGLE_CALLBACK_PATH).toString(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google từ chối mã đăng nhập (HTTP ${response.status})`);
  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  const payload = idToken?.split(".")[1];
  if (!payload) throw new Error("Google không trả về id_token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as IdTokenClaims;

  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("id_token sai issuer");
  }
  if (claims.aud !== env.googleClientId) throw new Error("id_token sai audience");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("id_token đã hết hạn");
  if (claims.email_verified !== true || !claims.email) throw new Error("Email Google chưa xác minh");
  return claims.email.toLowerCase();
}
