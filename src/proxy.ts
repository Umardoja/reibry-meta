import { canonicalOrigin } from "@/lib/auth/origin";
// Refresh scoped cookies for product routes. Every page/API still verifies independently.
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
  const pathname = request.nextUrl.pathname;
  const protectedDestination = pathname.startsWith("/memories") ? pathname : pathname.startsWith("/capture") ? "/capture" : pathname.startsWith("/ask") ? "/ask" : pathname.startsWith("/actions") ? "/actions" : pathname.startsWith("/today") ? "/today" : pathname.startsWith("/life") ? pathname : pathname.startsWith("/plans") ? pathname : pathname.startsWith("/settings") ? "/settings" : pathname.startsWith("/onboarding") ? "/onboarding" : "/account";
  const destination = new URL("/auth?next=" + encodeURIComponent(protectedDestination), origin);
  // A signed-out visit to /capture reaches the page, which verifies auth itself and only hands a shared link to sign-in (no data is
  // exposed). This includes a #url= fragment handoff, which the server cannot see and a redirect here would lose after sign-in.
  if (!incoming.some(c => isAuthCookie(c.name)) && pathname === "/capture")
    return applyAuthCookies(NextResponse.next(), [], origin.startsWith("https:"));
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
export const config = { matcher: ["/account/:path*", "/settings/:path*", "/today/:path*", "/onboarding/:path*", "/memories/:path*", "/capture/:path*", "/ask/:path*", "/actions/:path*", "/life/:path*", "/plans/:path*"] };
