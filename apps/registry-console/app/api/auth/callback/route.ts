import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, createSession, verifyVercelIdToken } from "../../../../lib/auth";

interface TokenResponse { access_token: string; id_token: string; expires_in: number }
interface UserInfo { sub: string; email?: string; email_verified?: boolean; name?: string; preferred_username?: string }

function same(left: string | null, right: string | undefined): boolean {
  return Boolean(left && right && left.length === right.length && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right)));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;
  const nonce = request.cookies.get("oauth_nonce")?.value;
  const verifier = request.cookies.get("oauth_code_verifier")?.value;
  if (!code || !nonce || !verifier || !same(state, storedState)) return NextResponse.json({ error: "Invalid OAuth callback." }, { status: 400 });
  const redirectUri = `${request.nextUrl.origin}/api/auth/callback`;
  const tokenResponse = await fetch("https://api.vercel.com/login/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id: authConfig.clientId(), client_secret: authConfig.clientSecret(), code, code_verifier: verifier, redirect_uri: redirectUri }), cache: "no-store" });
  if (!tokenResponse.ok) return NextResponse.json({ error: "Vercel token exchange failed." }, { status: 502 });
  const tokens = await tokenResponse.json() as TokenResponse;
  await verifyVercelIdToken(tokens.id_token, nonce);
  const userResponse = await fetch("https://api.vercel.com/login/oauth/userinfo", { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
  if (!userResponse.ok) return NextResponse.json({ error: "Vercel user lookup failed." }, { status: 502 });
  const user = await userResponse.json() as UserInfo;
  if (!user.email || user.email_verified !== true) return NextResponse.json({ error: "A verified Vercel email is required." }, { status: 403 });
  const session = await createSession({ sub: user.sub, email: user.email, name: user.name ?? user.preferred_username ?? user.email });
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(authConfig.sessionCookie, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 8 * 60 * 60, path: "/" });
  for (const name of ["oauth_state", "oauth_nonce", "oauth_code_verifier"]) response.cookies.set(name, "", { maxAge: 0, path: "/" });
  return response;
}
