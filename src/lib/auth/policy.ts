// Adapted from original REIBRY auth/account-policy.ts and next-destination.ts.
// Source 76d3494465bab43a5051498e90b9a486a65312b9; original contributors retain attribution.
export const messages = {
  AUTH_NOT_CONFIGURED: "Authentication is not configured. A separately approved disposable Supabase project is required.",
  INVALID_EMAIL: "Enter a valid email address.",
  WEAK_PASSWORD: "Use at least 8 characters for a new password.",
  INVALID_CREDENTIALS: "That email or password did not match.",
  EMAIL_UNCONFIRMED: "Confirm your email before signing in.",
  RATE_LIMIT: "Too many attempts. Please wait before trying again.",
  AUTH_UNAVAILABLE: "Account access is temporarily unavailable. Please try again.",
  AUTH_TIMEOUT: "The session service took too long. Please try again.",
  AUTH_REQUIRED: "Sign in to continue.",
  INVALID_REQUEST: "The request could not be accepted.",
  INVALID_CALLBACK: "This confirmation link could not be verified. Return to sign in.",
  SESSION_REFRESH_REQUIRED: "Your session needs to be checked again. Return to sign in.",
} as const;
export type ErrorCode = keyof typeof messages;
export class AuthFailure extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) { super(messages[code]); this.code = code; }
}
export function errorCode(error: unknown): ErrorCode {
  return error instanceof AuthFailure ? error.code : "AUTH_UNAVAILABLE";
}
export function providerFailure(error: { code?: string; status?: number; name?: string }): AuthFailure {
  if (error.status === 429) return new AuthFailure("RATE_LIMIT");
  if (error.code === "invalid_credentials") return new AuthFailure("INVALID_CREDENTIALS");
  if (error.code === "email_not_confirmed") return new AuthFailure("EMAIL_UNCONFIRMED");
  if (error.code === "weak_password") return new AuthFailure("WEAK_PASSWORD");
  if (["email_address_invalid", "validation_failed"].includes(error.code || "")) return new AuthFailure("INVALID_EMAIL");
  return new AuthFailure("AUTH_UNAVAILABLE");
}
export function missingSession(error: { code?: string; status?: number; name?: string }) {
  return error.name === "AuthSessionMissingError" || error.status === 401 ||
    ["bad_jwt", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(error.code || "");
}
export function safeNext(value: unknown): "/" | "/account" | null {
  // Only implemented destinations. Reject encoded/normalized URL tricks as well.
  return value === "/" || value === "/account" ? value : null;
}
export function credentials(value: unknown, signup: boolean): { email: string; password: string; next: string } {
  if (!value || typeof value !== "object") throw new AuthFailure("INVALID_REQUEST");
  const body = value as Record<string, unknown>;
  if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new AuthFailure("INVALID_EMAIL");
  if (typeof body.password !== "string" || body.password.length > 1024 || body.password.length < (signup ? 8 : 1)) throw new AuthFailure(signup ? "WEAK_PASSWORD" : "INVALID_CREDENTIALS");
  return { email: body.email.trim(), password: body.password, next: safeNext(body.next) || "/account" };
}
export async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, timeout = 8_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AuthFailure("AUTH_TIMEOUT")); }, timeout); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}
