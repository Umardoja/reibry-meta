import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies } from "../auth/server.ts";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure, missingSession, providerFailure } from "../auth/policy.ts";
import { createSupabaseMemoryRepository } from "../memory/supabase-repository.ts";
import { cookieJar, isAuthCookie } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { handleRetrievalRequest, retrievalPrivateHeaders } from "./handler.ts";

export async function retrievalApiRoute(request: Request) {
  const incoming = (await cookies()).getAll(); const jar = cookieJar(incoming);
  let origin: string;
  try { origin = canonicalOrigin(request, process.env.AUTH_SITE_URL); }
  catch { return NextResponse.json({ data: null, error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, { status: 503, headers: retrievalPrivateHeaders }); }
  const result = await handleRetrievalRequest(request, async signal => {
    if (!incoming.some(cookie => isAuthCookie(cookie.name))) throw new AuthFailure("AUTH_REQUIRED");
    const { client } = createUserSupabaseClient(jar, signal, origin); const { data, error } = await client.auth.getUser();
    if (error) { if (missingSession(error)) throw new AuthFailure("AUTH_REQUIRED"); throw providerFailure(error); }
    if (!data.user?.id) throw new AuthFailure("AUTH_REQUIRED");
    return { userId: data.user.id, repository: createSupabaseMemoryRepository(client, data.user.id) };
  });
  const response = NextResponse.json({ data: result.data, error: result.error }, { status: result.status, headers: retrievalPrivateHeaders });
  return applyAuthCookies(response, result.status === 401 ? jar.clear() : result.error ? [] : jar.writes(), origin.startsWith("https:"));
}
