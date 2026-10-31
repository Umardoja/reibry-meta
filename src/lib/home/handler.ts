import { proposalInputs, proposalView } from "../actions/contracts.ts";
import { ActionRepositoryFailure, type ActionRepository } from "../actions/repository.ts";
import { MetaClientError, type MetaFailureCode } from "../ai/meta/client.ts";
import { MetaContractError } from "../ai/meta/contracts.ts";
import type { ConversationReasoner } from "../ai/meta/grounded-reasoning.ts";
import type { AskRateLimiter } from "../ai/rate-limit.ts";
import { AuthFailure, bounded, errorCode as authErrorCode } from "../auth/policy.ts";
import type { LifeContext } from "../life/contracts.ts";
import { LifeRepositoryFailure, type LifeRepository } from "../life/repository.ts";
import { createLifeFromText, deterministicLifeContext } from "../life/service.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { SEARCH_CANDIDATE_MAX, type RetrievalItem } from "../retrieval/contracts.ts";
import type { Memory } from "../memory/contracts.ts";
import { resolveConversationEvidence } from "./references.ts";
import { emptyHomeResponse, homeLifeItem, HomeContractError, HOME_RESULT_MAX, parseHomeBody, type HomeIntent, type HomeRequest, type HomeResponse } from "./contracts.ts";
import { classifyHomeIntent, isPlanningRequest, isSmallTalk } from "./intent.ts";

export type HomeContext = { userId: string; memoryRepository: MemoryRepository; lifeRepository: LifeRepository; actionRepository: ActionRepository };
export type HomeContextFactory = (signal: AbortSignal) => Promise<HomeContext>;
type FailureCode = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE" |
  "AI_NOT_CONFIGURED" | "AI_TIMEOUT" | "AI_ACCESS_DENIED" | "AI_BILLING_REQUIRED" | "AI_RATE_LIMITED" | "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE";
/** Sanitized per-request diagnostics: no message text, Memory content, IDs, cookies or secrets. */
export type HomeDiagnostics = { requestId: string; stage: string; category: string | null; providerInvoked: boolean; providerOutcome: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null; timingsMs: Record<string, number> };
export type HomeResult = { status: number; data: HomeResponse | null; error: { code: FailureCode; message: string } | null; diagnostics?: HomeDiagnostics };
class HomeTrace {
  readonly requestId = globalThis.crypto.randomUUID(); stage = "parse"; providerInvoked = false; providerOutcome: string | null = null;
  usage: HomeDiagnostics["usage"] = null; private timings: Record<string, number> = {}; private mark = performance.now();
  enter(stage: string) { const at = performance.now(); this.timings[this.stage] = (this.timings[this.stage] ?? 0) + Math.round(at - this.mark); this.mark = at; this.stage = stage; }
  report(category: string | null): HomeDiagnostics { const failedAt = this.stage; this.enter(failedAt); return { requestId: this.requestId, stage: failedAt, category,
    providerInvoked: this.providerInvoked, providerOutcome: this.providerOutcome, usage: this.usage, timingsMs: { ...this.timings } }; }
}
/** Distinguishes auth rejection from auth upstream failure, storage, provider and unexpected errors, by stage. */
function errorCategory(error: unknown, stage: string) {
  if (error instanceof AuthFailure) return error.code === "AUTH_REQUIRED" ? "auth-rejected" : error.code === "AUTH_TIMEOUT" ? `timeout:${stage}` : `auth-upstream:${error.code}`;
  if (error instanceof HomeContractError) return "validation";
  if (error instanceof MetaContractError || error instanceof MetaClientError) return `provider:${error instanceof MetaClientError ? error.code : "contract"}`;
  if (error instanceof MemoryRepositoryFailure || error instanceof LifeRepositoryFailure || error instanceof ActionRepositoryFailure) return `storage:${stage}:${error.code}`;
  return `unexpected:${stage}:${error instanceof Error ? error.name : typeof error}`;
}
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
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16_384) { cancel(); throw new HomeContractError("Request is too large."); } chunks.push(value); }
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

async function conversationEvidence(input: HomeRequest, context: HomeContext, now: Date) {
  const candidates = (await context.memoryRepository.searchCandidates(SEARCH_CANDIDATE_MAX)).filter(memory => memory.userId === context.userId);
  const owned = new Map(candidates.map(memory => [memory.id, memory]));
  // Client references are only hints about what was shown last turn; each one is re-read through the owner-bound repository.
  // Missing (deleted) and foreign IDs are dropped; the rest keep the position the user saw them in.
  const referenced: Array<{ memory: Memory; position: number }> = [];
  for (const [index, id] of input.references.entries()) {
    let memory = owned.get(id);
    if (!memory) { try { memory = await context.memoryRepository.read(id); } catch (error) { if (error instanceof MemoryRepositoryFailure && error.code === "NOT_FOUND") continue; throw error; } }
    if (memory.userId === context.userId) referenced.push({ memory, position: index + 1 });
  }
  return resolveConversationEvidence({ message: input.message, priorUserText: [...input.history].reverse().find(turn => turn.role === "user")?.text,
    candidates, referenced, now, timezone: input.timezone, limit: HOME_RESULT_MAX });
}
function smallTalkReply(message: string) {
  if (/\b(?:thanks|thank you|thx|cheers)\b/i.test(message)) return "You're welcome, happy to help.";
  if (/\b(?:bye|goodbye|see you)\b/i.test(message)) return "See you soon. Your saved things will be here when you need them.";
  if (/^(?:hi|hey|hello|hiya|yo|howdy|good (?:morning|afternoon|evening))\b/i.test(message.trim())) return "Hi! What would you like to find or plan today?";
  return "I can find things you've saved, explain what a saved note says, show what's coming up, and help you plan from your saved ideas. Try “What did I save for the weekend?”";
}
function unavailableLead(code: MetaFailureCode) {
  return code === "META_RATE_LIMIT" ? "You're sending messages a little fast for me to think them through. Give me a moment. Meanwhile, these saved Memories look related:"
    : "I can't reach Muse Spark right now, so I can't talk this through properly. These saved Memories look related:";
}
async function converse(input: HomeRequest, intent: HomeIntent, context: HomeContext, reasoner: ConversationReasoner, limiter: AskRateLimiter,
  signal: AbortSignal, now: () => Date, trace: HomeTrace): Promise<HomeResult> {
  const chatty = isSmallTalk(input.message);
  trace.enter("retrieval");
  const { items, shownEarlier, resolution } = chatty ? { items: [] as RetrievalItem[], shownEarlier: new Map<string, number>(), resolution: null } : await conversationEvidence(input, context, now());
  trace.enter("life");
  const lifeContexts = chatty ? [] : (await context.lifeRepository.listUpcoming(now().toISOString(), 5))
    .map(item => ({ title: item.title, type: item.type, start_date: item.startDate, status: item.status }));
  const fallback = (code: MetaFailureCode, diagnostic: string | null = null): HomeResult => {
    const reason = diagnostic ? `${code}:${diagnostic}` : code;
    if (chatty) { const data = emptyHomeResponse("CONVERSATION", smallTalkReply(input.message)); data.fallbackReason = reason; return { status: 200, data, error: null }; }
    if (!items.length) return failure(metaFailure(code));
    const data = emptyHomeResponse("MEMORY_SEARCH", unavailableLead(code)); data.memories = items; data.fallbackReason = reason; return { status: 200, data, error: null };
  };
  trace.enter("provider");
  if (!limiter.consume(context.userId)) { trace.providerOutcome = "rate-limited-before-call"; return fallback("META_RATE_LIMIT"); }
  let answer;
  try {
    trace.providerInvoked = true;
    answer = await reasoner({ message: input.message, history: input.history, items, shownEarlier, lifeContexts, timezone: input.timezone,
      today: new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: input.timezone }).format(now()),
      externalActionRequested: intent === "UNSUPPORTED", referenceResolution: resolution }, signal);
  } catch (error) { if (error instanceof MetaClientError) { trace.providerOutcome = error.diagnostic ? `${error.code}:${error.diagnostic}` : error.code; return fallback(error.code, error.diagnostic); } throw error; }
  trace.providerOutcome = "valid"; trace.usage = answer.usage;
  trace.enter("proposals");
  const inputs = isPlanningRequest(input.message) ? proposalInputs(answer.proposed_next_steps, new Set(items.map(item => item.memoryId))) : [];
  if (inputs.length && !answer.model) throw new ActionRepositoryFailure("INVALID_STATE");
  const persisted = inputs.length ? await context.actionRepository.createProposals(inputs, `meta:${answer.model}`) : [];
  if (persisted.length !== inputs.length) throw new ActionRepositoryFailure("STORAGE_UNAVAILABLE");
  const proposals = persisted.map(proposalView);
  const data = emptyHomeResponse(intent === "UNSUPPORTED" ? "UNSUPPORTED" : "CONVERSATION", answer.answer);
  data.groundedAnswer = { ...answer, proposed_next_steps: inputs.length ? answer.proposed_next_steps : [], action_proposals: proposals }; data.actionProposals = proposals;
  return { status: 200, data, error: null };
}

export async function handleHomeRequest(request: Request, factory: HomeContextFactory, reasoner: ConversationReasoner, limiter: AskRateLimiter,
  expectedOrigin = new URL(request.url).origin, timeout = 25_000, now = () => new Date()): Promise<HomeResult> {
  if (request.method !== "POST") return failure("VALIDATION_ERROR", 405);
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return failure("VALIDATION_ERROR", 403);
  const trace = new HomeTrace();
  try { const result = await bounded(async signal => {
    const input = parseHomeBody(await readJson(request, signal)); const intent = classifyHomeIntent(input.message, input.timezone, now());
    trace.enter("auth"); const context = await factory(signal); assertOwner(context); trace.enter(intent === "LIFE_UPCOMING" || intent === "LIFE_UNDATED" || intent === "LIFE_DRAFT" ? "life" : intent === "ACTION_REVIEW" ? "actions" : "conversation");
    if (input.mode === "confirm-life" && intent !== "LIFE_DRAFT") throw new HomeContractError("Only a Life draft can be confirmed.");
    if (intent === "LIFE_UPCOMING") { const items = filterLife(await context.lifeRepository.listUpcoming(now().toISOString(), 50), input.message); const data = emptyHomeResponse(intent, items.length === 1 ? "Here's what's coming up next." : items.length ? `Here are the next ${items.length} things coming up.` : "Nothing is coming up in Life right now. Tell me about a plan and I'll draft it for you."); data.lifeContexts = items.map(homeLifeItem); return { status: 200, data, error: null }; }
    if (intent === "LIFE_UNDATED") { const items = filterLife(await context.lifeRepository.listUndated(50), input.message); const data = emptyHomeResponse(intent, items.length ? "These still need a date:" : "Everything in Life has a date, so there's nothing to fix."); data.lifeContexts = items.map(homeLifeItem); return { status: 200, data, error: null }; }
    if (intent === "ACTION_REVIEW") { const proposals = (await context.actionRepository.listProposals()).slice(0, HOME_RESULT_MAX).map(proposalView); const data = emptyHomeResponse(intent, proposals.length ? "Here's what's waiting for your review. Nothing is saved until you confirm it." : "There's nothing waiting for your review right now."); data.actionProposals = proposals; return { status: 200, data, error: null }; }
    if (intent !== "LIFE_DRAFT") return converse(input, intent, context, reasoner, limiter, signal, now, trace);
    const draft = deterministicLifeContext({ text: input.message, timezone: input.timezone, referenceNow: now() });
    if (!draft.startDate) return { status: 200, data: emptyHomeResponse("CLARIFICATION", "When is it happening? Give me a day and time, like “Saturday at 4pm”, and I'll draft it for you to confirm. I won't guess the date."), error: null };
    if (input.mode === "message") { const data = emptyHomeResponse(intent, "Here's a draft. Check the details and save it if it looks right."); data.lifeDraft = { ...draft, sourceText: input.message, requiresConfirmation: true }; return { status: 200, data, error: null }; }
    const saved = await createLifeFromText(context.lifeRepository, { text: input.message, timezone: input.timezone }, now); const data = emptyHomeResponse(intent, saved.duplicate ? "That's already in Life." : "Saved to Life."); data.savedLife = homeLifeItem(saved.contexts[0]); return { status: saved.duplicate ? 200 : 201, data, error: null };
  }, timeout); return { ...result, diagnostics: trace.report(result.error ? `provider:${result.error.code}` : null) }; }
  catch (error) { return { ...failure(mapped(error)), diagnostics: trace.report(errorCategory(error, trace.stage)) }; }
}
