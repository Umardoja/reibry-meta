import { AuthFailure, bounded, errorCode as authErrorCode } from "../auth/policy.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { searchOwnedMemories } from "../retrieval/service.ts";
import { MetaClientError, type MetaFailureCode } from "./meta/client.ts";
import { MetaContractError, parseAskBody, type AskResponse } from "./meta/contracts.ts";
import { noEvidenceAnswer, type MetaReasoner } from "./meta/grounded-reasoning.ts";
import type { AskRateLimiter } from "./rate-limit.ts";
import { proposalInputs, proposalView } from "../actions/contracts.ts";
import { ActionRepositoryFailure, type ActionRepository } from "../actions/repository.ts";

export type AskContext = { userId: string; repository: MemoryRepository; actionRepository: ActionRepository };
export type AskContextFactory = (signal: AbortSignal) => Promise<AskContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE" |
  "AI_NOT_CONFIGURED" | "AI_TIMEOUT" | "AI_ACCESS_DENIED" | "AI_BILLING_REQUIRED" | "AI_RATE_LIMITED" | "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE" |
  "ACTION_STORAGE_UNAVAILABLE";
export type AskResult = { status: number; data: AskResponse | null; error: { code: FailureCode; message: string } | null };
export const askPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer", Pragma: "no-cache" };
const messages: Record<FailureCode, string> = {
  VALIDATION_ERROR: "Enter a valid question about your saved Memories.", AUTH_REQUIRED: "Sign in to ask REIBRY.",
  AUTH_NOT_CONFIGURED: "Authentication is not configured.", AUTH_TIMEOUT: "Session verification took too long.",
  STORAGE_UNAVAILABLE: "Memory search is temporarily unavailable.", AI_NOT_CONFIGURED: "Meta reasoning is not configured.",
  AI_TIMEOUT: "Muse Spark took too long to respond.", AI_ACCESS_DENIED: "Meta credentials or model access were rejected.",
  AI_BILLING_REQUIRED: "Meta billing or credits require attention.", AI_RATE_LIMITED: "Ask REIBRY is temporarily rate limited. Try again shortly.",
  AI_UNAVAILABLE: "Muse Spark is temporarily unavailable.", AI_INVALID_RESPONSE: "Muse Spark returned an answer that could not be safely verified.",
  ACTION_STORAGE_UNAVAILABLE: "Action proposals could not be saved safely.",
};
function failure(code: FailureCode): AskResult {
  const status = code === "AUTH_REQUIRED" ? 401 : code === "VALIDATION_ERROR" ? 400 : code === "AI_RATE_LIMITED" ? 429 :
    ["AUTH_TIMEOUT", "AI_TIMEOUT"].includes(code) ? 504 : code === "AI_INVALID_RESPONSE" ? 502 : 503;
  return { status, data: null, error: { code, message: messages[code] } };
}
async function readJson(request: Request, signal: AbortSignal) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new MetaContractError("Use JSON.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0; const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > 8_192) { cancel(); throw new MetaContractError("Request is too large."); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MetaContractError("Use valid JSON."); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
function metaFailure(code: MetaFailureCode): FailureCode {
  return code === "META_NOT_CONFIGURED" ? "AI_NOT_CONFIGURED" : code === "META_TIMEOUT" ? "AI_TIMEOUT" :
    ["META_AUTH", "META_ACCESS"].includes(code) ? "AI_ACCESS_DENIED" : code === "META_BILLING" ? "AI_BILLING_REQUIRED" :
    code === "META_RATE_LIMIT" ? "AI_RATE_LIMITED" : code === "META_INVALID_RESPONSE" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE";
}
function mapped(error: unknown): FailureCode {
  if (error instanceof MetaContractError) return "VALIDATION_ERROR";
  if (error instanceof MetaClientError) return metaFailure(error.code);
  if (error instanceof ActionRepositoryFailure) return "ACTION_STORAGE_UNAVAILABLE";
  if (error instanceof MemoryRepositoryFailure) return "STORAGE_UNAVAILABLE";
  if (error instanceof AuthFailure) {
    const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE";
  }
  return "AI_UNAVAILABLE";
}

/** Shared Stage 8 execution boundary used by Ask REIBRY and the restored Home. */
export async function executeGroundedAsk(question: string, context: AskContext, reasoner: MetaReasoner, limiter: AskRateLimiter,
  signal: AbortSignal): Promise<AskResponse> {
  if (context.repository.ownerId !== context.userId || context.actionRepository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
  const retrieval = await searchOwnedMemories(context.repository, question, 6);
  if (retrieval.state === "no-match") return noEvidenceAnswer();
  if (!limiter.consume(context.userId)) throw new MetaClientError("META_RATE_LIMIT");
  const answer = await reasoner(question, retrieval.items, signal);
  const inputs = proposalInputs(answer.proposed_next_steps, new Set(retrieval.items.map(item => item.memoryId)));
  if (inputs.length && !answer.model) throw new ActionRepositoryFailure("INVALID_STATE");
  const persisted = inputs.length ? await context.actionRepository.createProposals(inputs, `meta:${answer.model}`) : [];
  if (persisted.length !== inputs.length) throw new ActionRepositoryFailure("STORAGE_UNAVAILABLE");
  return { ...answer, action_proposals: persisted.map(proposalView) };
}

export async function handleAskRequest(request: Request, factory: AskContextFactory, reasoner: MetaReasoner, limiter: AskRateLimiter,
  expectedOrigin = new URL(request.url).origin, timeout = 25_000): Promise<AskResult> {
  if (request.method !== "POST") return { ...failure("VALIDATION_ERROR"), status: 405 };
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return { ...failure("VALIDATION_ERROR"), status: 403 };
  try {
    return await bounded(async signal => {
      const { question } = parseAskBody(await readJson(request, signal));
      return { status: 200, data: await executeGroundedAsk(question, await factory(signal), reasoner, limiter, signal), error: null };
    }, timeout);
  } catch (error) { return failure(mapped(error)); }
}
