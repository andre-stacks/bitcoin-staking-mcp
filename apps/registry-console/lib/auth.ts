import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

const SESSION_COOKIE = "scout_registry_session";
const issuer = "https://vercel.com";
const jwks = createRemoteJWKSet(new URL("https://vercel.com/.well-known/jwks"));

export interface PublisherSession {
  sub: string;
  email: string;
  name: string;
  publisher: boolean;
  csrf: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sessionKey(): Uint8Array {
  return new TextEncoder().encode(required("SESSION_SECRET"));
}

export function publisherEmails(): Set<string> {
  return new Set((process.env.PUBLISHER_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export async function createSession(input: Omit<PublisherSession, "publisher" | "csrf">): Promise<string> {
  const email = input.email.trim().toLowerCase();
  return new SignJWT({ email, name: input.name, publisher: publisherEmails().has(email), csrf: crypto.randomBytes(24).toString("base64url") })
    .setProtectedHeader({ alg: "HS256" }).setSubject(input.sub).setIssuedAt().setIssuer("scout-registry-console").setAudience("scout-registry-publisher").setExpirationTime("8h").sign(sessionKey());
}

export async function readSession(token: string | undefined): Promise<PublisherSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { issuer: "scout-registry-console", audience: "scout-registry-publisher" });
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string" || typeof payload.publisher !== "boolean" || typeof payload.csrf !== "string") return null;
    return { sub: payload.sub, email: payload.email, name: payload.name, publisher: payload.publisher, csrf: payload.csrf };
  } catch { return null; }
}

export async function currentSession(): Promise<PublisherSession | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requirePublisher(request: NextRequest): Promise<PublisherSession> {
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw Object.assign(new Error("Authentication required."), { status: 401 });
  if (!session.publisher || !publisherEmails().has(session.email.trim().toLowerCase())) throw Object.assign(new Error("This account has read-only access."), { status: 403 });
  return session;
}

export function assertMutationRequest(request: NextRequest, session: PublisherSession): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) throw Object.assign(new Error("Cross-origin mutation denied."), { status: 403 });
  const csrf = request.headers.get("x-registry-csrf");
  if (!csrf || csrf.length !== session.csrf.length || !crypto.timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))) {
    throw Object.assign(new Error("Invalid CSRF token."), { status: 403 });
  }
}

export async function verifyVercelIdToken(token: string, nonce: string) {
  const result = await jwtVerify(token, jwks, { issuer, audience: required("NEXT_PUBLIC_VERCEL_APP_CLIENT_ID") });
  if (typeof result.payload.nonce !== "string" || result.payload.nonce.length !== nonce.length || !crypto.timingSafeEqual(Buffer.from(result.payload.nonce), Buffer.from(nonce))) {
    throw new Error("Vercel ID token nonce mismatch.");
  }
  return result;
}

export const authConfig = {
  clientId: () => required("NEXT_PUBLIC_VERCEL_APP_CLIENT_ID"),
  clientSecret: () => required("VERCEL_APP_CLIENT_SECRET"),
  sessionCookie: SESSION_COOKIE,
};
