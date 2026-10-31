import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies } from "../auth/server.ts";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure, missingSession, providerFailure } from "../auth/policy.ts";
import { cookieJar, isAuthCookie } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { createTrustedVideoClient } from "../supabase/trusted-server.ts";
import { removeVideoObject } from "../video/storage.ts";
import { handleMemoryRequest, memoryPrivateHeaders, type MemoryOperation } from "./handler.ts";
import { createSupabaseMemoryRepository } from "./supabase-repository.ts";

export async function memoryApiRoute(operation: MemoryOperation, request: Request, id: string | null = null) {
  const incoming = (await cookies()).getAll(); const jar = cookieJar(incoming);
  let origin: string;
  try { origin = canonicalOrigin(request, process.env.AUTH_SITE_URL); }
  catch { return NextResponse.json({ data: null, error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, { status: 503, headers: memoryPrivateHeaders }); }
  const result = await handleMemoryRequest(operation, request, id, async signal => {
    if (!incoming.some(cookie => isAuthCookie(cookie.name))) throw new AuthFailure("AUTH_REQUIRED");
    const { client } = createUserSupabaseClient(jar, signal, origin);
    const { data, error } = await client.auth.getUser();
    if (error) { if (missingSession(error)) throw new AuthFailure("AUTH_REQUIRED"); throw providerFailure(error); }
    if (!data.user?.id) throw new AuthFailure("AUTH_REQUIRED");
    return { userId: data.user.id, repository: createSupabaseMemoryRepository(client, data.user.id, { removeVideoObject: path => removeVideoObject(createTrustedVideoClient(signal), path) }) };
  }, origin);
  const response = NextResponse.json({ data: result.data, error: result.error }, { status: result.status, headers: memoryPrivateHeaders });
  return applyAuthCookies(response, result.status === 401 ? jar.clear() : result.error ? [] : jar.writes(), origin.startsWith("https:"));
}
