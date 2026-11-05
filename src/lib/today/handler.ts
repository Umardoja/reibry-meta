import { AuthFailure, bounded, errorCode as authErrorCode, messages as authMessages } from "../auth/policy.ts";
import { LifeRepositoryFailure, type LifeRepository } from "../life/repository.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { buildTodayFeed } from "./service.ts";

export type TodayContext = { userId: string; memoryRepository: MemoryRepository; lifeRepository: LifeRepository };
export type TodayContextFactory = (signal: AbortSignal) => Promise<TodayContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE";
export type TodayResult = { status: number; data: unknown; error: { code: FailureCode; message: string } | null };
export const todayPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
const messages: Record<FailureCode, string> = { VALIDATION_ERROR: "Today accepts no filters.", AUTH_REQUIRED: "Sign in to view Today.",
  AUTH_NOT_CONFIGURED: authMessages.AUTH_NOT_CONFIGURED, AUTH_TIMEOUT: authMessages.AUTH_TIMEOUT, STORAGE_UNAVAILABLE: "Today is temporarily unavailable." };
function failure(code: FailureCode, status = code === "AUTH_REQUIRED" ? 401 : code === "VALIDATION_ERROR" ? 400 : code === "AUTH_TIMEOUT" ? 504 : 503): TodayResult {
  return { status, data: null, error: { code, message: messages[code] } };
}
function mapped(error: unknown): FailureCode {
  if (error instanceof MemoryRepositoryFailure || error instanceof LifeRepositoryFailure) return "STORAGE_UNAVAILABLE";
  if (error instanceof AuthFailure) { const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE"; }
  return "STORAGE_UNAVAILABLE";
}
export async function handleTodayRequest(request: Request, factory: TodayContextFactory, timeout = 8_000): Promise<TodayResult> {
  if (request.method !== "GET") return failure("VALIDATION_ERROR", 405);
  if ([...new URL(request.url).searchParams.keys()].length) return failure("VALIDATION_ERROR");
  try { return await bounded(async signal => { const context = await factory(signal);
    if (context.userId !== context.memoryRepository.ownerId || context.userId !== context.lifeRepository.ownerId) throw new AuthFailure("AUTH_REQUIRED");
    return { status: 200, data: await buildTodayFeed(context.memoryRepository, context.lifeRepository), error: null };
  }, timeout); } catch (error) { return failure(mapped(error)); }
}
