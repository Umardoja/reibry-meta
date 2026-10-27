import { AuthFailure, bounded, errorCode as authErrorCode, messages as authMessages } from "../auth/policy.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { CaptureContractError, parseCaptureInput } from "./contracts.ts";
import { capture } from "./service.ts";

export type CaptureContext = { userId: string; repository: MemoryRepository };
export type CaptureContextFactory = (signal: AbortSignal) => Promise<CaptureContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE";
export type CaptureResponse = { status: number; data: unknown; error: { code: FailureCode; message: string } | null };
export const capturePrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
const messages: Record<FailureCode, string> = { VALIDATION_ERROR: "Check the note or link and try again.", AUTH_REQUIRED: "Sign in to capture a Memory.",
  AUTH_NOT_CONFIGURED: authMessages.AUTH_NOT_CONFIGURED, AUTH_TIMEOUT: authMessages.AUTH_TIMEOUT,
  STORAGE_UNAVAILABLE: "The source could not be saved because Memory storage is unavailable." };
function failure(code: FailureCode, status = code === "AUTH_REQUIRED" ? 401 : code === "VALIDATION_ERROR" ? 400 : code === "AUTH_TIMEOUT" ? 504 : 503): CaptureResponse {
  return { status, data: null, error: { code, message: messages[code] } };
}
async function readJson(request: Request, signal: AbortSignal) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new CaptureContractError("Use a JSON body.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > 65_536) { cancel(); throw new CaptureContractError("Request is too large."); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CaptureContractError("Use valid JSON."); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
function mapped(error: unknown): FailureCode {
  if (error instanceof CaptureContractError) return "VALIDATION_ERROR";
  if (error instanceof MemoryRepositoryFailure) return "STORAGE_UNAVAILABLE";
  if (error instanceof AuthFailure) {
    const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE";
  }
  return "STORAGE_UNAVAILABLE";
}
export async function handleCaptureRequest(request: Request, factory: CaptureContextFactory,
  expectedOrigin = new URL(request.url).origin, timeout = 8_000): Promise<CaptureResponse> {
  if (request.method !== "POST") return failure("VALIDATION_ERROR", 405);
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return failure("VALIDATION_ERROR", 403);
  try {
    return await bounded(async signal => {
      const input = parseCaptureInput(await readJson(request, signal));
      const context = await factory(signal);
      if (context.repository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
      const result = await capture(input, context.repository);
      return { status: result.duplicate ? 200 : 201, data: result, error: null };
    }, timeout);
  } catch (error) { return failure(mapped(error)); }
}
