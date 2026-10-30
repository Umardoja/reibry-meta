import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createInMemoryAskRateLimiter } from "../src/lib/ai/rate-limit.ts";
import { MetaClientError } from "../src/lib/ai/meta/client.ts";
import type { MetaReasoner } from "../src/lib/ai/meta/grounded-reasoning.ts";
import { AuthFailure } from "../src/lib/auth/policy.ts";
import type { LifeContext } from "../src/lib/life/contracts.ts";
import { LifeRepositoryFailure } from "../src/lib/life/repository.ts";
import type { Memory } from "../src/lib/memory/contracts.ts";
import { handleHomeRequest, type HomeContext } from "../src/lib/home/handler.ts";
import { classifyHomeIntent } from "../src/lib/home/intent.ts";
import { createActionTestState, createInMemoryActionRepository } from "./support/in-memory-action-repository.ts";
import { createInMemoryLifeRepository, createLifeTestState } from "./support/in-memory-life-repository.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";

const origin = "http://127.0.0.1:3000"; const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const memoryId = "20000000-0000-4000-8000-000000000001"; const now = new Date("2026-10-30T10:00:00.000Z");
const memory = (overrides: Partial<Memory> = {}): Memory => ({ id: memoryId, userId: userA, title: "Lagos hotel shortlist", sourceType: "text", sourceUrl: null,
  rawText: "Three Lagos hotel ideas near the conference.", analysisStatus: "complete", metadata: {}, createdAt: "2026-10-29T12:00:00.000Z", updatedAt: "2026-10-29T12:00:00.000Z", ...overrides });
const life = (id: string, overrides: Partial<LifeContext> = {}): LifeContext => ({ id, userId: userA, type: "trip", title: "Lagos conference", description: "Conference travel",
  startDate: "2026-11-01T10:00:00.000Z", endDate: null, status: "active", confidence: null, createdAt: "2026-10-29T12:00:00.000Z", updatedAt: "2026-10-29T12:00:00.000Z", ...overrides });
function context(memories: Memory[] = [memory()], lives: LifeContext[] = []) { const actionState = createActionTestState(memories.map(item => [item.id, item.userId])); return {
  userId: userA, memoryRepository: createInMemoryMemoryRepository(userA, createMemoryTestState(memories)), lifeRepository: createInMemoryLifeRepository(userA, createLifeTestState(lives), { now: () => now.toISOString() }),
  actionRepository: createInMemoryActionRepository(userA, actionState, { now: () => now.toISOString() }), actionState };
}
function request(message: string, mode: "message" | "confirm-life" = "message") { return new Request(`${origin}/api/home`, { method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }, body: JSON.stringify({ message, mode, timezone: "UTC" }) }); }
const noProvider: MetaReasoner = async () => { throw new Error("provider must not run"); };
function reasoner(onCall?: () => void): MetaReasoner { return async (_question, items) => { onCall?.(); return { answer: "Your saved note lists three Lagos hotel ideas.", evidence_status: "supported",
  cited_memory_ids: [items[0].memoryId], proposed_next_steps: [{ title: "Compare hotels", description: "Review the saved shortlist.", supporting_memory_ids: [items[0].memoryId] }],
  provider_called: true, model: "muse-spark-1.3", usage: { inputTokens: 20, outputTokens: 12, totalTokens: 32 }, citations: [{ memory_id: items[0].memoryId, title: items[0].displayTitle,
    memory_href: items[0].memoryHref, evidence_limit: items[0].sourceType === "link" ? "metadata-only-link" : "stored-note" }], action_proposals: [] }; }; }
async function run(message: string, value = context(), model: MetaReasoner = noProvider, mode: "message" | "confirm-life" = "message") { return handleHomeRequest(request(message, mode), async () => value, model, createInMemoryAskRateLimiter(), origin, 5_000, () => now); }

test("allowlisted deterministic intent routing covers Memory, Muse, Life, Actions and unsupported tools", () => {
  assert.equal(classifyHomeIntent("Find my saved Lagos notes"), "MEMORY_SEARCH"); assert.equal(classifyHomeIntent("What did I save about Lagos?"), "GROUNDED_ANSWER");
  assert.equal(classifyHomeIntent("What's coming up?"), "LIFE_UPCOMING"); assert.equal(classifyHomeIntent("What Life contexts need dates?"), "LIFE_UNDATED");
  assert.equal(classifyHomeIntent("Show my birthday plans"), "LIFE_UPCOMING"); assert.equal(classifyHomeIntent("Explain the proposed action"), "ACTION_REVIEW");
  assert.equal(classifyHomeIntent("Add my meeting tomorrow at 10am"), "LIFE_DRAFT"); assert.equal(classifyHomeIntent("Review my Action proposals"), "ACTION_REVIEW");
  assert.equal(classifyHomeIntent("Send an email for me"), "UNSUPPORTED"); assert.equal(classifyHomeIntent("Maybe something"), "CLARIFICATION");
});
test("Memory search returns only actual owner evidence without invoking Muse", async () => { const result = await run("Find my saved Lagos hotel notes"); assert.equal(result.status, 200); assert.equal(result.data?.intent, "MEMORY_SEARCH");
  assert.deepEqual(result.data?.memories.map(item => item.memoryId), [memoryId]); assert.equal(result.data?.groundedAnswer, null); });
test("grounded answer reuses Stage 8 execution, exact citations and persisted inert proposals", async () => { let calls = 0; const value = context(); const result = await run("What did I save about Lagos hotels?", value, reasoner(() => calls++));
  assert.equal(result.status, 200); assert.equal(calls, 1); assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, memoryId); assert.equal(result.data?.actionProposals.length, 1);
  assert.equal(value.actionState.cards.size, 0); assert.equal(value.actionState.proposals.size, 1); });
test("no matching Memory is honest and skips the provider", async () => { let calls = 0; const result = await run("What did I save about submarines?", context([]), reasoner(() => calls++));
  assert.equal(result.status, 200); assert.equal(calls, 0); assert.equal(result.data?.groundedAnswer?.evidence_status, "insufficient"); assert.equal(result.data?.actionProposals.length, 0); });
test("metadata-only links remain explicitly limited", async () => { const link = memory({ sourceType: "link", sourceUrl: "https://video.example/watch?token=private", rawText: null, title: "Lagos hotel video", metadata: { platform: "video.example" } });
  const result = await run("What did I save about Lagos hotel videos?", context([link]), reasoner()); assert.equal(result.data?.groundedAnswer?.citations[0].evidence_limit, "metadata-only-link"); });
test("upcoming and undated Life questions use bounded owner repositories", async () => { const future = life("10000000-0000-4000-8000-000000000001"); const undated = life("10000000-0000-4000-8000-000000000002", { title: "Birthday ideas", startDate: null }); const value = context([], [future, undated]);
  assert.deepEqual((await run("What's coming up?", value)).data?.lifeContexts.map(item => item.id), [future.id]); assert.deepEqual((await run("What Life contexts need dates?", value)).data?.lifeContexts.map(item => item.id), [undated.id]); });
test("Life creation remains a draft until explicit confirmation and is idempotent", async () => { const value = context([], []); const message = "Add my meeting tomorrow at 10am";
  const draft = await run(message, value); assert.ok(draft.data?.lifeDraft); assert.equal(draft.data?.savedLife, null); assert.equal((await value.lifeRepository.list()).length, 0);
  const saved = await run(message, value, noProvider, "confirm-life"); assert.equal(saved.status, 201); assert.ok(saved.data?.savedLife); assert.equal((await value.lifeRepository.list()).length, 1);
  const duplicate = await run(message, value, noProvider, "confirm-life"); assert.equal(duplicate.status, 200); assert.equal((await value.lifeRepository.list()).length, 1); });
test("missing Life date asks a follow-up and never persists or invents a date", async () => { const value = context([], []); const result = await run("Add my birthday party", value); assert.equal(result.data?.intent, "CLARIFICATION");
  assert.match(result.data?.message || "", /date or time/i); assert.equal((await value.lifeRepository.list()).length, 0); });
test("Action review returns trusted owned proposal IDs while confirmation remains on Stage 9", async () => { const value = context(); const [proposal] = await value.actionRepository.createProposals([{ title: "Compare hotels", description: "Review shortlist", supportingMemoryIds: [memoryId] }], "meta:muse-spark-1.3");
  const result = await run("Review my Action proposals", value); assert.deepEqual(result.data?.actionProposals.map(item => item.id), [proposal.id]); assert.equal(value.actionState.cards.size, 0);
  const first = await value.actionRepository.confirm(proposal.id); const retry = await value.actionRepository.confirm(proposal.id); assert.equal(first.id, retry.id); assert.equal(value.actionState.cards.size, 1); });
test("anonymous, expired and cross-owner contexts fail closed", async () => { const limiter = createInMemoryAskRateLimiter();
  for (const factory of [async () => { throw new AuthFailure("AUTH_REQUIRED"); }, async () => ({ ...context(), userId: userB }) as HomeContext]) { const result = await handleHomeRequest(request("Find my saved Lagos notes"), factory, noProvider, limiter, origin); assert.equal(result.status, 401); } });
test("provider and database failures are safe", async () => { const provider = await run("What did I save about Lagos hotels?", context(), async () => { throw new MetaClientError("META_UNAVAILABLE"); }); assert.equal(provider.status, 503); assert.equal(provider.error?.code, "AI_UNAVAILABLE");
  const value = context([], []); const broken = { ...value.lifeRepository, async listUpcoming() { throw new LifeRepositoryFailure("STORAGE_UNAVAILABLE"); } }; const storage = await run("What's coming up?", { ...value, lifeRepository: broken }); assert.equal(storage.status, 503); assert.equal(storage.error?.code, "STORAGE_UNAVAILABLE"); });
test("Home rejects forged fields, cross-site requests and arbitrary confirmation modes", async () => { const value = context(); const forged = new Request(`${origin}/api/home`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ message: "Find notes", user_id: userB }) });
  assert.equal((await handleHomeRequest(forged, async () => value, noProvider, createInMemoryAskRateLimiter(), origin)).status, 400); const cross = request("Find notes"); cross.headers.set("Origin", "https://outside.test"); assert.equal((await handleHomeRequest(cross, async () => value, noProvider, createInMemoryAskRateLimiter(), origin)).status, 403);
  assert.equal((await run("Find my saved notes", value, noProvider, "confirm-life")).status, 400); });
test("production Home has one provider boundary, no arbitrary tools, Plans, Ready Packs or mock fallback", async () => { const files = await Promise.all(["contracts", "intent", "handler", "server"].map(name => readFile(`src/lib/home/${name}.ts`, "utf8"))); const source = files.join("\n");
  assert.doesNotMatch(source, /callMetaResponses|META_ENDPOINT|tests\/support|ready[_ -]?packs?|\/api\/plans|sendEmail|child_process|from ["']node:child_process|calendar\(/i); assert.match(source, /executeGroundedAsk/); assert.match(source, /createLifeFromText/); });
test("original Home hierarchy, composer, prompts, evidence, Life and Action review states are restored", async () => { const source = await readFile("src/components/home/home-conversation.tsx", "utf8");
  for (const text of ["What are you trying to do", "Tell me what you&apos;re planning", "Find a Memory", "Plan something", "What&apos;s coming up", "Message REIBRY", "New chat", "View Memory", "Save to Life", "ActionProposalReview"]) assert.match(source, new RegExp(text));
  assert.match(source, /RequireAuth nextPath="\/"/); assert.doesNotMatch(source, /Completed|Ready Pack|fake|sample Memory/); });
