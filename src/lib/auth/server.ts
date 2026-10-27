import "server-only";
import { canonicalOrigin } from "./origin.ts";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAuthAdapter } from "../supabase/server.ts";
import { cookieJar, isAuthCookie, type CookieWrite } from "../supabase/cookies.ts";
import { handleAuth, privateHeaders, type Operation } from "./handler.ts";
import { AuthFailure, bounded } from "./policy.ts";

export function applyAuthCookies(response: NextResponse, writes: CookieWrite[], secure: boolean) {
  for (const { name, value, options } of writes) {
    // Explicitly omit Domain: only host-scoped cookies belong to this application.
    response.cookies.set(name, value, { path: "/", httpOnly: true, sameSite: "lax", secure,
      maxAge: options.maxAge, expires: options.expires });
  }
  for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
export async function authRoute(operation: Operation, request: Request) {
  const incoming = (await cookies()).getAll();
  const jar = cookieJar(incoming);
  let origin: string;
  try { origin = canonicalOrigin(request, process.env.AUTH_SITE_URL); } catch { return NextResponse.json({ data: null, error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, { status: 503, headers: privateHeaders }); }
  const result = await handleAuth(operation, request,
    signal => createAuthAdapter(jar, signal, origin),
    incoming.some(c => isAuthCookie(c.name)), 8_000, origin);
  const response = operation === "callback"
    ? NextResponse.redirect(new URL(result.destination || "/auth?error=INVALID_CALLBACK", origin), 303)
    : NextResponse.json({ data: result.data, error: result.error }, { status: result.status });
  return applyAuthCookies(response, result.clearSession ? jar.clear() : result.error ? [] : jar.writes(), origin.startsWith("https:"));
}
export async function verifiedPageUser() {
  const incoming = (await cookies()).getAll();
  if (!incoming.some(c => isAuthCookie(c.name))) return null;
  const jar = cookieJar(incoming);
  const user = await bounded(signal => createAuthAdapter(jar, signal).verify());
  // Proxy handles refresh before rendering; never silently discard refreshed cookies.
  if (jar.writes().length) throw new AuthFailure("SESSION_REFRESH_REQUIRED");
  return user;
}
