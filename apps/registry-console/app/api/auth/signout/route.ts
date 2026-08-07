import { NextResponse } from "next/server";
import { authConfig } from "../../../../lib/auth";

export async function POST() {
  const response = NextResponse.redirect(new URL("/", process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"), 303);
  response.cookies.set(authConfig.sessionCookie, "", { maxAge: 0, path: "/" });
  return response;
}
