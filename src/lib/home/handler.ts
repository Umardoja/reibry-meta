import { proposalView } from "../actions/contracts.ts";
import { ActionRepositoryFailure, type ActionRepository } from "../actions/repository.ts";
import { executeGroundedAsk, type AskContext } from "../ai/handler.ts";
import { MetaClientError, type MetaFailureCode } from "../ai/meta/client.ts";
import { MetaContractError } from "../ai/meta/contracts.ts";
import type { MetaReasoner } from "../ai/meta/grounded-reasoning.ts";
import type { AskRateLimiter } from "../ai/rate-limit.ts";
import { AuthFailure, bounded, errorCode as authErrorCode } from "../auth/policy.ts";
import type { LifeContext } from "../life/contracts.ts";
import { LifeRepositoryFailure, type LifeRepository } from "../life/repository.ts";
import { createLifeFromText, deterministicLifeContext } from "../life/service.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { searchOwnedMemories } from "../retrieval/service.ts";
import { emptyHomeResponse, homeLifeItem, HomeContractError, HOME_RESULT_MAX, parseHomeBody, type HomeResponse } from "./contracts.ts";
import { classifyHomeIntent, homeSearchQuery } from "./intent.ts";

export type HomeContext = { userId: string; memoryRepository: MemoryRepository; lifeRepository: LifeRepository; actionRepository: ActionRepository };
export type HomeContextFactory = (signal: AbortSignal) => Promise<HomeContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE" |
  "AI_NOT_CONFIGURED" | "AI_TIMEOUT" | "AI_ACCESS_DENIED" | "AI_BILLING_REQUIRED" | "AI_RATE_LIMITED" | "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE";
export type HomeResult = { status: number; data: HomeResponse | null; error: { code: FailureCode; message: string } | null };
export const homePrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer", Pragma: "no-cache" };

const messages: Record<FailureCode, string> = {
  VALIDATION_ERROR: "Tell REIBRY what you are trying to do.", AUTH_REQUIRED: "Sign in to use REIBRY Home.",
  AUTH_NOT_CONFIGURED: "Authentication is not configured.", AUTH_TIMEOUT: "Session verification took too long.",
  STORAGE_UNAVAILABLE: "REIBRY could not load your saved information.", AI_NOT_CONFIGURED: "Meta reasoning is not configured.",
  AI_TIMEOUT: "Muse Spark took too long to respond.", AI_ACCESS_DENIED: "Meta credentials or model access were rejected.",
  AI_BILLING_REQUIRED: "Meta billing or credits require attention.", AI_RATE_LIMITED: "Ask REIBRY is temporarily rate limited. Try again shortly.",
  AI_UNAVAILABLE: "Muse Spark is temporarily unavailable.", AI_INVALID_RESPONSE: "Muse Spark returned an answer that could not be safely verified.",
};
function failure(code: FailureCode, status = code === "AUTH_REQUIRED" ? 401 : code === "VALIDATION_ERROR" ? 400 : code === "AI_RATE_LIMITED" ? 429 :
  ["AUTH_TIMEOUT", "AI_TIMEOUT"].includes(code) ? 504 : code === "AI_INVALID_RESPONSE" ? 502 : 503): HomeResult {
  return { status, data: null, error: { code, message: messages[code] } };
}
function metaFailure(code: MetaFailureCode): FailureCode {
  return code === "META_NOT_CONFIGURED" ? "AI_NOT_CONFIGURED" : code === "META_TIMEOUT" ? "AI_TIMEOUT" :
    ["META_AUTH", "META_ACCESS"].includes(code) ? "AI_ACCESS_DENIED" : code === "META_BILLING" ? "AI_BILLING_REQUIRED" :
    code === "META_RATE_LIMIT" ? "AI_RATE_LIMITED" : code === "META_INVALID_RESPONSE" ? "AI_INVALID_RESPONSE" : "AI_UNAVAILABLE";
}
function mapped(error: unknown): FailureCode {
  if (error instanceof HomeContractError) return "VALIDATION_ERROR";
  if (error instanceof MetaContractError) return "AI_INVALID_RESPONSE";
  if (error instanceof MetaClientError) return metaFailure(error.code);
  if (error instanceof MemoryRepositoryFailure || error instanceof LifeRepositoryFailure || error instanceof ActionRepositoryFailure) return "STORAGE_UNAVAILABLE";
  if (error instanceof AuthFailure) { const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE"; }
  return "STORAGE_UNAVAILABLE";
}
async function readJson(request: Request, signal: AbortSignal) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new HomeContractError("Use JSON.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0; const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8_192) { cancel(); throw new HomeContractError("Request is too large."); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HomeContractError("Use valid JSON."); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
const lifeStop = new Set("show my the life contexts context plans plan events event what do i have coming up upcoming next need needs date dates without no undated".split(" "));
function lifeTerms(value: string) { return [...new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(term => term.length > 2 && !lifeStop.has(term)))].slice(0, 6); }
function filterLife(items: LifeContext[], message: string) { const terms = lifeTerms(message); if (!terms.length) return items.slice(0, HOME_RESULT_MAX); return items.filter(item => { const source = `${item.title} ${item.description || ""}`.toLowerCase(); return terms.every(term => source.includes(term)); }).slice(0, HOME_RESULT_MAX); }
function assertOwner(context: HomeContext) {
  if ([context.memoryRepository.ownerId, context.lifeRepository.ownerId, context.actionRepository.ownerId].some(id => id !== context.userId)) throw new AuthFailure("AUTH_REQUIRED");
}

export async function handleHomeRequest(request: Request, factory: HomeContextFactory, reasoner: MetaReasoner, limiter: AskRateLimiter,
  expectedOrigin = new URL(request.url).origin, timeout = 25_000, now = () => new Date()): Promise<HomeResult> {
  if (request.method !== "POST") return failure("VALIDATION_ERROR", 405);
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return failure("VALIDATION_ERROR", 403);
  try { return await bounded(async signal => {
    const input = parseHomeBody(await readJson(request, signal)); const intent = classifyHomeIntent(input.message); const context = await factory(signal); assertOwner(context);
    if (input.mode === "confirm-life" && intent !== "LIFE_DRAFT") throw new HomeContractError("Only a Life draft can be confirmed.");
    if (intent === "UNSUPPORTED") return { status: 200, data: emptyHomeResponse(intent, "I can search saved Memories, reason from their evidence, review Actions, and help with Life contexts. I cannot execute external tools."), error: null };
    if (intent === "CLARIFICATION") return { status: 200, data: emptyHomeResponse(intent, "Are you trying to find a saved Memory, ask about your evidence, review an Action, or add something to Life?"), error: null };
    if (intent === "MEMORY_SEARCH") { const result = await searchOwnedMemories(context.memoryRepository, homeSearchQuery(input.message), HOME_RESULT_MAX); const data = emptyHomeResponse(intent, result.state === "matches" ? `I found ${result.items.length} saved ${result.items.length === 1 ? "Memory" : "Memories"}.` : "I couldn't find a saved Memory that matches that description."); data.memories = result.items; return { status: 200, data, error: null }; }
    if (intent === "GROUNDED_ANSWER") { const answer = await executeGroundedAsk(input.message, { userId: context.userId, repository: context.memoryRepository, actionRepository: context.actionRepository } satisfies AskContext, reasoner, limiter, signal); const data = emptyHomeResponse(intent, answer.answer); data.groundedAnswer = answer; data.actionProposals = answer.action_proposals; return { status: 200, data, error: null }; }
    if (intent === "LIFE_UPCOMING") { const items = filterLife(await context.lifeRepository.listUpcoming(now().toISOString(), 50), input.message); const data = emptyHomeResponse(intent, items.length ? "Here’s what you have coming up." : "I couldn't find an upcoming Life context that matches."); data.lifeContexts = items.map(homeLifeItem); return { status: 200, data, error: null }; }
    if (intent === "LIFE_UNDATED") { const items = filterLife(await context.lifeRepository.listUndated(50), input.message); const data = emptyHomeResponse(intent, items.length ? "These Life contexts still need dates." : "You don't have any matching Life contexts without dates."); data.lifeContexts = items.map(homeLifeItem); return { status: 200, data, error: null }; }
    if (intent === "ACTION_REVIEW") { const proposals = (await context.actionRepository.listProposals()).slice(0, HOME_RESULT_MAX).map(proposalView); const data = emptyHomeResponse(intent, proposals.length ? "Here are your current Action proposals. Review is required before saving one." : "You don't have any Action proposals to review."); data.actionProposals = proposals; return { status: 200, data, error: null }; }
    const draft = deterministicLifeContext({ text: input.message, timezone: input.timezone, referenceNow: now() });
    if (!draft.startDate) return { status: 200, data: emptyHomeResponse("CLARIFICATION", "What date or time should I use? I won't invent one."), error: null };
    if (input.mode === "message") { const data = emptyHomeResponse(intent, "Review this Life context before saving it."); data.lifeDraft = { ...draft, sourceText: input.message, requiresConfirmation: true }; return { status: 200, data, error: null }; }
    const saved = await createLifeFromText(context.lifeRepository, { text: input.message, timezone: input.timezone }, now); const data = emptyHomeResponse(intent, saved.duplicate ? "That Life context was already saved." : "Life context saved."); data.savedLife = homeLifeItem(saved.contexts[0]); return { status: saved.duplicate ? 200 : 201, data, error: null };
  }, timeout); } catch (error) { return failure(mapped(error)); }
}
