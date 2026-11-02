import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies } from "../auth/server.ts";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure, bounded, missingSession, providerFailure } from "../auth/policy.ts";
import { cookieJar, isAuthCookie } from "../supabase/cookies.ts";
import type { CookieWrite } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { createTrustedShortcutCaptureClient } from "../supabase/trusted-server.ts";
import { createShortcutCredential, hashShortcutCredential, parseDeviceIssue, ShortcutCaptureContractError } from "./contracts.ts";
import { handleShortcutCapture, shortcutCaptureHeaders } from "./handler.ts";
import { createShortcutCaptureWriter, createShortcutDeviceRepository } from "./repository.ts";

const setupHeaders = { ...shortcutCaptureHeaders, Vary: "Cookie" };
const disabled = () => NextResponse.json({ data: null, error: { code: "SHORTCUT_CAPTURE_DISABLED", message: "Shortcut saving is not enabled." } }, { status: 503, headers: setupHeaders });
function enabled() { return process.env.SHORTCUT_CAPTURE_ENABLED === "true"; }
function api(response: NextResponse, writes: CookieWrite[], origin: string) { return applyAuthCookies(response, writes, origin.startsWith("https:")); }
async function setupContext(request: Request, signal: AbortSignal) {
  const incoming = (await cookies()).getAll(); const jar = cookieJar(incoming);
  if (!incoming.some(cookie => isAuthCookie(cookie.name))) throw new AuthFailure("AUTH_REQUIRED");
  const origin = canonicalOrigin(request, process.env.AUTH_SITE_URL);
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new ShortcutCaptureContractError("Invalid origin.");
  const { client } = createUserSupabaseClient(jar, signal, origin); const { data, error } = await client.auth.getUser();
  if (error) { if (missingSession(error)) throw new AuthFailure("AUTH_REQUIRED"); throw providerFailure(error); }
  if (!data.user?.id) throw new AuthFailure("AUTH_REQUIRED");
  return { repository: createShortcutDeviceRepository(client), jar, origin };
}
function setupFailure(error: unknown) {
  const status = error instanceof AuthFailure && error.code === "AUTH_REQUIRED" ? 401 : error instanceof ShortcutCaptureContractError ? 400 : 503;
  const code = status === 401 ? "AUTH_REQUIRED" : status === 400 ? "VALIDATION_ERROR" : "STORAGE_UNAVAILABLE";
  return NextResponse.json({ data: null, error: { code, message: status === 401 ? "Sign in to manage Shortcut access." : status === 400 ? "Check the Shortcut setup details." : "Shortcut setup is unavailable." } }, { status, headers: setupHeaders });
}
async function readSetupBody(request: Request) {
  const length = Number(request.headers.get("content-length") || "0"); if (length > 1_024) throw new ShortcutCaptureContractError("Request is too large.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new ShortcutCaptureContractError("Use JSON.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; total += next.value.length; if (total > 1_024) { void reader.cancel(); throw new ShortcutCaptureContractError("Request is too large."); } chunks.push(next.value); }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ShortcutCaptureContractError("Use JSON."); }
  } finally { reader.releaseLock(); }
}

/** Authenticated owner-only setup: creates/list/revokes hashed, capture-only device credentials. */
export async function shortcutDevicesApiRoute(request: Request) {
  if (!enabled()) return disabled();
  let context: Awaited<ReturnType<typeof setupContext>> | null = null;
  try {
    const result = await bounded(async signal => {
      context = await setupContext(request, signal);
      if (request.method === "GET") return { status: 200, data: { devices: await context.repository.list() }, secret: null as string | null };
      if (request.method === "POST") {
        const input = parseDeviceIssue(await readSetupBody(request)); const secret = createShortcutCredential();
        const expiresAt = new Date(Date.now() + input.expiresDays * 86_400_000).toISOString();
        const device = await context.repository.issue({ tokenHash: hashShortcutCredential(secret), name: input.name, expiresAt });
        return { status: 201, data: { device }, secret };
      }
      if (request.method === "DELETE") {
        const value = await readSetupBody(request); if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) throw new ShortcutCaptureContractError("Use a device identifier.");
        await context.repository.revoke(value.id.toLowerCase()); return { status: 200, data: { revoked: true }, secret: null as string | null };
      }
      throw new ShortcutCaptureContractError("Unsupported method.");
    }, 8_000);
    const response = NextResponse.json({ data: result.data, ...(result.secret ? { setupSecret: result.secret } : {}), error: null }, { status: result.status, headers: setupHeaders });
    const known = context as Awaited<ReturnType<typeof setupContext>> | null;
    return api(response, known?.jar.writes() ?? [], known?.origin ?? new URL(request.url).origin);
  } catch (error) { const response = setupFailure(error); const known = context as Awaited<ReturnType<typeof setupContext>> | null; return known ? api(response, known.jar.writes(), known.origin) : response; }
}

/** External device route: no cookie/session is accepted as authorization, only the capture credential. */
export async function shortcutCaptureApiRoute(request: Request) {
  const credential = request.headers.get("x-reibry-capture-key");
  const result = await handleShortcutCapture(request, { enabled: enabled(), credential,
    hash: hashShortcutCredential, write: (tokenHash, requestId, signal) => createShortcutCaptureWriter(createTrustedShortcutCaptureClient(signal), tokenHash, requestId) });
  return NextResponse.json({ data: result.data, error: result.error }, { status: result.status, headers: shortcutCaptureHeaders });
}
