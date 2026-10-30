import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseActionRepository } from "../actions/supabase-repository.ts";
import { createMetaReasoner } from "../ai/meta/grounded-reasoning.ts";
import { sharedAskRateLimiter } from "../ai/server.ts";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure, missingSession, providerFailure } from "../auth/policy.ts";
import { applyAuthCookies } from "../auth/server.ts";
import { createSupabaseLifeRepository } from "../life/supabase-repository.ts";
import { createSupabaseMemoryRepository } from "../memory/supabase-repository.ts";
import { cookieJar, isAuthCookie } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { createTrustedProposalClient } from "../supabase/trusted-server.ts";
import { handleHomeRequest, homePrivateHeaders } from "./handler.ts";

export async function homeApiRoute(request: Request) {
  const incoming = (await cookies()).getAll(); const jar = cookieJar(incoming); let origin: string;
  try { origin = canonicalOrigin(request, process.env.AUTH_SITE_URL); }
  catch { return NextResponse.json({ data: null, error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, { status: 503, headers: homePrivateHeaders }); }
  const result = await handleHomeRequest(request, async signal => {
    if (!incoming.some(cookie => isAuthCookie(cookie.name))) throw new AuthFailure("AUTH_REQUIRED");
    const { client } = createUserSupabaseClient(jar, signal, origin); const { data, error } = await client.auth.getUser();
    if (error) { if (missingSession(error)) throw new AuthFailure("AUTH_REQUIRED"); throw providerFailure(error); }
    if (!data.user?.id) throw new AuthFailure("AUTH_REQUIRED");
    return { userId: data.user.id, memoryRepository: createSupabaseMemoryRepository(client, data.user.id),
      lifeRepository: createSupabaseLifeRepository(client, data.user.id),
      actionRepository: createSupabaseActionRepository(client, data.user.id, { client: () => createTrustedProposalClient(signal) }) };
  }, createMetaReasoner(), sharedAskRateLimiter, origin);
  const response = NextResponse.json({ data: result.data, error: result.error }, { status: result.status, headers: homePrivateHeaders });
  return applyAuthCookies(response, result.status === 401 ? jar.clear() : result.error ? [] : jar.writes(), origin.startsWith("https:"));
}
