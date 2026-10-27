import { canonicalOrigin } from "@/lib/auth/origin";
// Cookie refresh only for the protected account page. The page/API verify independently.
import { NextResponse, type NextRequest } from "next/server";
import { cookieJar, isAuthCookie } from "@/lib/supabase/cookies";
import { createAuthAdapter } from "@/lib/supabase/server";
import { bounded } from "@/lib/auth/policy";
import { applyAuthCookies } from "@/lib/auth/server";
export async function proxy(request: NextRequest) {
  let origin: string;
  try { origin = canonicalOrigin(request, process.env.AUTH_SITE_URL); } catch { return new NextResponse("Authentication is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const incoming = request.cookies.getAll();
  const jar = cookieJar(incoming);
  const destination = new URL("/auth?next=/account", origin);
  if (!incoming.some(c => isAuthCookie(c.name))) return applyAuthCookies(NextResponse.redirect(destination), [], origin.startsWith("https:"));
  try {
    const user = await bounded(signal => createAuthAdapter(jar, signal, origin).verify());
    if (!user) return applyAuthCookies(NextResponse.redirect(destination), jar.clear(), origin.startsWith("https:"));
    for (const item of jar.writes()) request.cookies.set(item.name, item.value);
    return applyAuthCookies(NextResponse.next({ request }), jar.writes(), origin.startsWith("https:"));
  } catch {
    destination.searchParams.set("error", "AUTH_UNAVAILABLE");
    return applyAuthCookies(NextResponse.redirect(destination), [], origin.startsWith("https:"));
  }
}
export const config = { matcher: ["/account/:path*"] };
