// Client-safe bounded state machine. No credentials or mock authentication mode.
import { AuthFailure, bounded, errorCode, messages, type ErrorCode } from "./policy.ts";
export type SessionState = { status: "checking" | "authenticated" | "unauthenticated" | "error"; user: { id: string } | null; error: ErrorCode | null; attempts: number; version: number };
export const initialSession: SessionState = { status: "checking", user: null, error: null, attempts: 1, version: 0 };
type Event = { type: "result"; version: number; user: { id: string } | null; error?: ErrorCode } | { type: "retry" | "refresh" | "lock" | "signed-out" };
export function sessionReducer(state: SessionState, event: Event): SessionState {
  if (event.type === "lock") return { ...state, status: "error", user: null, error: "AUTH_REQUIRED", version: state.version + 1 };
  if (event.type === "signed-out") return { ...state, status: "unauthenticated", user: null, error: null, version: state.version + 1 };
  if (event.type === "retry" || event.type === "refresh") {
    if (event.type === "retry" && (state.attempts >= 3 || state.status === "checking")) return state;
    return { ...initialSession, version: state.version + 1, attempts: event.type === "refresh" ? 1 : state.attempts + 1 };
  }
  if (event.type === "result") {
    if (event.version !== state.version || state.status !== "checking") return state;
    return { ...state, user: event.error ? null : event.user, error: event.error || null,
      status: event.error ? "error" : event.user ? "authenticated" : "unauthenticated" };
  }
  return state;
}
export function canShowProtected(state: SessionState) { return state.status === "authenticated" && !!state.user?.id; }
export async function requestAuth(path: string, init: RequestInit = {}, transport: typeof fetch = fetch, timeout = 12_000, parentSignal?: AbortSignal) {
  return bounded(async signal => {
    const response = await transport(path, { ...init, credentials: "same-origin", cache: "no-store",
      signal: parentSignal ? AbortSignal.any([signal, parentSignal]) : signal });
    const body = await response.json();
    if (!response.ok) {
      const code = body?.error?.code;
      throw new AuthFailure(typeof code === "string" && Object.hasOwn(messages, code) ? code as ErrorCode : "AUTH_UNAVAILABLE");
    }
    return body.data as Record<string, unknown>;
  }, timeout);
}
export async function checkSession(transport: typeof fetch = fetch, timeout = 12_000, signal?: AbortSignal): Promise<{ user: { id: string } | null; error?: ErrorCode }> {
  try {
    const data = await requestAuth("/api/auth/session", {}, transport, timeout, signal);
    if (data?.user === null) return { user: null };
    const user = data?.user as { id?: unknown } | undefined;
    if (!user || typeof user.id !== "string" || !user.id) throw new AuthFailure("AUTH_UNAVAILABLE");
    return { user: { id: user.id } };
  } catch (error) { return { user: null, error: errorCode(error) }; }
}
