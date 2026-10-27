// Injectable orchestration: the production route binds only the real SSR adapter.
import { AuthFailure, bounded, credentials, errorCode, messages, safeNext, type ErrorCode } from "./policy.ts";
export type Operation = "sign-in" | "sign-up" | "session" | "me" | "sign-out" | "callback";
export interface AuthAdapter {
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, next: string): Promise<{ requiresConfirmation: boolean }>;
  verify(): Promise<{ id: string } | null>;
  signOut(): Promise<void>;
  exchange(code: string): Promise<void>;
}
export type AdapterFactory = (signal: AbortSignal) => AuthAdapter;
export type AuthResult = { status: number; data: Record<string, unknown> | null; error: { code: ErrorCode; message: string } | null; clearSession?: boolean; destination?: string };
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "Referrer-Policy": "no-referrer" };
function failure(code: ErrorCode): AuthResult {
  const status = code === "AUTH_REQUIRED" || code === "INVALID_CREDENTIALS" || code === "EMAIL_UNCONFIRMED" ? 401 : code === "RATE_LIMIT" ? 429 : code === "AUTH_TIMEOUT" ? 504 : ["AUTH_NOT_CONFIGURED", "AUTH_UNAVAILABLE", "SESSION_REFRESH_REQUIRED"].includes(code) ? 503 : 400;
  return { status, data: null, error: { code, message: messages[code] } };
}
async function readInput(request: Request, signal: AbortSignal) {
  if (!request.headers.get("content-type")?.startsWith("application/json") || !request.body) throw new AuthFailure("INVALID_REQUEST");
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new AuthFailure("AUTH_TIMEOUT");
      if (done) break;
      size += value.length;
      if (size > 8192) { cancel(); throw new AuthFailure("INVALID_REQUEST"); }
      text += decoder.decode(value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); } catch { throw new AuthFailure("INVALID_REQUEST"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
export async function handleAuth(operation: Operation, request: Request, factory: AdapterFactory, hasCookie: boolean, timeout = 8_000, expectedOrigin = new URL(request.url).origin): Promise<AuthResult> {
  const mutation = ["sign-in", "sign-up", "sign-out"].includes(operation);
  if (mutation && (request.method !== "POST" || request.headers.get("origin") !== expectedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site")) return { ...failure("INVALID_REQUEST"), status: 403 };
  if (!mutation && request.method !== "GET") return { ...failure("INVALID_REQUEST"), status: 405 };
  try {
    const result = await bounded(async (signal): Promise<AuthResult> => {
      if ((operation === "session" || operation === "me") && !hasCookie) {
        return operation === "me" ? failure("AUTH_REQUIRED") : { status: 200, data: { user: null }, error: null };
      }
      if (operation === "sign-out" && !hasCookie) return { status: 200, data: { signedOut: true, remoteRevoked: true }, error: null };
      if (operation === "sign-in" || operation === "sign-up") {
        const input = credentials(await readInput(request, signal), operation === "sign-up");
        const adapter = factory(signal);
        if (operation === "sign-up") return { status: 200, data: await adapter.signUp(input.email, input.password, input.next), error: null };
        await adapter.signIn(input.email, input.password);
        return { status: 200, data: { signedIn: true }, error: null };
      }
      if (operation === "callback" && !hasCookie) throw new AuthFailure("INVALID_CALLBACK");
      const adapter = factory(signal);
      if (operation === "sign-out") {
        await adapter.signOut();
        return { status: 200, data: { signedOut: true, remoteRevoked: true }, error: null };
      }
      if (operation === "callback") {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code || code.length > 2048) throw new AuthFailure("INVALID_CALLBACK");
        await adapter.exchange(code);
        if (!await adapter.verify()) throw new AuthFailure("INVALID_CALLBACK");
        return { status: 200, data: null, error: null, destination: safeNext(url.searchParams.get("next")) || "/account" };
      }
      const user = await adapter.verify();
      if (!user) return operation === "me" ? { ...failure("AUTH_REQUIRED"), clearSession: true } : { status: 200, data: { user: null }, error: null, clearSession: true };
      return { status: 200, data: { user: { id: user.id } }, error: null };
    }, timeout);
    return operation === "sign-out" ? { ...result, clearSession: true } : result;
  } catch (error) {
    if (operation === "sign-out") return { status: 200, data: { signedOut: true, remoteRevoked: false }, error: null, clearSession: true };
    return failure(errorCode(error));
  }
}
