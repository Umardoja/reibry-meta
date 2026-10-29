import { AuthFailure, bounded, errorCode as authErrorCode, messages as authMessages } from "../auth/policy.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { parseSearchRequest, RetrievalContractError } from "./contracts.ts";
import { searchOwnedMemories } from "./service.ts";

export type RetrievalContext = { userId: string; repository: MemoryRepository };
export type RetrievalContextFactory = (signal: AbortSignal) => Promise<RetrievalContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE";
export type RetrievalResult = { status: number; data: unknown; error: { code: FailureCode; message: string } | null };
export const retrievalPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
const messages: Record<FailureCode, string> = { VALIDATION_ERROR: "Enter a valid Memory search query.", AUTH_REQUIRED: "Sign in to search Memories.",
  AUTH_NOT_CONFIGURED: authMessages.AUTH_NOT_CONFIGURED, AUTH_TIMEOUT: authMessages.AUTH_TIMEOUT,
  STORAGE_UNAVAILABLE: "Memory search is temporarily unavailable." };
function failure(code: FailureCode, status = code === "AUTH_REQUIRED" ? 401 : code === "VALIDATION_ERROR" ? 400 : code === "AUTH_TIMEOUT" ? 504 : 503): RetrievalResult {
  return { status, data: null, error: { code, message: messages[code] } };
}
function mapped(error: unknown): FailureCode {
  if (error instanceof RetrievalContractError) return "VALIDATION_ERROR";
  if (error instanceof MemoryRepositoryFailure) return "STORAGE_UNAVAILABLE";
  if (error instanceof AuthFailure) {
    const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE";
  }
  return "STORAGE_UNAVAILABLE";
}
export async function handleRetrievalRequest(request: Request, factory: RetrievalContextFactory, timeout = 8_000): Promise<RetrievalResult> {
  if (request.method !== "GET") return failure("VALIDATION_ERROR", 405);
  try {
    const input = parseSearchRequest(new URL(request.url));
    return await bounded(async signal => {
      const context = await factory(signal);
      if (context.repository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
      return { status: 200, data: await searchOwnedMemories(context.repository, input.query, input.limit), error: null };
    }, timeout);
  } catch (error) { return failure(mapped(error)); }
}
