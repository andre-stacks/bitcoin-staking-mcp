import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
  const url = new URL("https://vercel.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: authConfig.clientId(), redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  const response = NextResponse.redirect(url);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 600, path: "/" };
  response.cookies.set("oauth_state", state, options);
  response.cookies.set("oauth_nonce", nonce, options);
  response.cookies.set("oauth_code_verifier", verifier, options);
  return response;
}
