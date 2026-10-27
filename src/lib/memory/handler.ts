import { AuthFailure, bounded, errorCode as authErrorCode, messages as authMessages } from "../auth/policy.ts";
import { MemoryContractError, memoryId, parseCreateMemory, parseMemoryList, parseUpdateMemory } from "./contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "./repository.ts";

export type MemoryOperation = "list" | "create" | "read" | "update" | "delete";
export type MemoryContext = { userId: string; repository: MemoryRepository };
export type MemoryContextFactory = (signal: AbortSignal) => Promise<MemoryContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE" | "NOT_FOUND";
export type MemoryResult = { status: number; data: unknown; error: { code: FailureCode; message: string } | null };
export const memoryPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "Referrer-Policy": "no-referrer" };
const messages: Record<FailureCode, string> = {
  VALIDATION_ERROR: "Check the Memory details and try again.", AUTH_REQUIRED: "Sign in to access Memories.",
  AUTH_NOT_CONFIGURED: authMessages.AUTH_NOT_CONFIGURED, AUTH_TIMEOUT: authMessages.AUTH_TIMEOUT,
  STORAGE_UNAVAILABLE: "Memory storage is temporarily unavailable.", NOT_FOUND: "Memory not found.",
};
function failure(code: FailureCode): MemoryResult {
  const status = code === "AUTH_REQUIRED" ? 401 : code === "NOT_FOUND" ? 404 : code === "VALIDATION_ERROR" ? 400 : code === "AUTH_TIMEOUT" ? 504 : 503;
  return { status, data: null, error: { code, message: messages[code] } };
}
async function readJson(request: Request, signal: AbortSignal) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new MemoryContractError("Use a JSON body.");
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 65_536) { cancel(); throw new MemoryContractError("Request is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MemoryContractError("Use valid JSON."); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
function mapped(error: unknown): FailureCode {
  if (error instanceof MemoryContractError) return "VALIDATION_ERROR";
  if (error instanceof MemoryRepositoryFailure) return error.code;
  if (error instanceof AuthFailure) {
    const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE";
  }
  return "STORAGE_UNAVAILABLE";
}
export async function handleMemoryRequest(operation: MemoryOperation, request: Request, id: string | null,
  factory: MemoryContextFactory, expectedOrigin = new URL(request.url).origin, timeout = 8_000): Promise<MemoryResult> {
  const method = { list: "GET", create: "POST", read: "GET", update: "PATCH", delete: "DELETE" }[operation];
  if (request.method !== method) return { ...failure("VALIDATION_ERROR"), status: 405 };
  if (["create", "update", "delete"].includes(operation) && (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site"))
    return { ...failure("VALIDATION_ERROR"), status: 403 };
  try {
    return await bounded(async signal => {
      const itemId = id === null ? null : memoryId(id);
      const context = await factory(signal);
      if (context.repository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
      if (operation === "list") return { status: 200, data: await context.repository.list(parseMemoryList(new URL(request.url))), error: null };
      if (operation === "create") return { status: 201, data: await context.repository.create(parseCreateMemory(await readJson(request, signal))), error: null };
      if (operation === "read") return { status: 200, data: await context.repository.read(itemId!), error: null };
      if (operation === "update") return { status: 200, data: await context.repository.update(itemId!, parseUpdateMemory(await readJson(request, signal))), error: null };
      await context.repository.delete(itemId!); return { status: 200, data: { id: itemId }, error: null };
    }, timeout);
  } catch (error) { return failure(mapped(error)); }
}
