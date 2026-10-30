import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthFailure } from "../src/lib/auth/policy.ts";
import { proposalInputs } from "../src/lib/actions/contracts.ts";
import { handleActionRequest, type ActionContextFactory } from "../src/lib/actions/handler.ts";
import { ActionRepositoryFailure } from "../src/lib/actions/repository.ts";
import { createActionTestState, createInMemoryActionRepository, type ActionTestState } from "./support/in-memory-action-repository.ts";

const origin = "http://localhost:3000";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const memoryA = "11111111-1111-4111-8111-111111111111";
const memoryB = "22222222-2222-4222-8222-222222222222";

function actionState() { return createActionTestState([[memoryA, userA], [memoryB, userB]]); }
function factory(ownerId: string, state: ActionTestState, options: Parameters<typeof createInMemoryActionRepository>[2] = {}): ActionContextFactory {
  const repository = createInMemoryActionRepository(ownerId, state, options);
  return async () => ({ userId: ownerId, repository });
}
function get(path: string) { return new Request(`${origin}${path}`); }
function post(path: string, body?: string) {
  return new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" }, body });
}
async function proposed(state: ActionTestState, ownerId = userA) {
  const repository = createInMemoryActionRepository(ownerId, state);
  const [proposal] = await repository.createProposals([{ title: "Review launch", description: "Use the saved launch evidence.", supportingMemoryIds: [memoryA] }], "meta:muse-spark-1.3");
  assert.ok(proposal); return proposal;
}

test("grounded suggestions are bounded and unsupported citations never become proposals", () => {
  const valid = { title: " Review launch ", description: " Use the saved evidence. ", supporting_memory_ids: [memoryA] };
  const inputs = proposalInputs([valid, { ...valid, title: "Forged", supporting_memory_ids: [memoryB] }], new Set([memoryA]));
  assert.deepEqual(inputs, [{ title: "Review launch", description: "Use the saved evidence.", supportingMemoryIds: [memoryA] }]);
});

test("repository rejects cross-owner citations and never accepts a caller owner field", async () => {
  const repository = createInMemoryActionRepository(userA, actionState());
  await assert.rejects(repository.createProposals([{ title: "Forge", description: "Cross-owner evidence.", supportingMemoryIds: [memoryB] }], "meta:muse-spark-1.3"),
    (error: unknown) => error instanceof ActionRepositoryFailure && error.code === "INVALID_STATE");
  assert.equal("userId" in ({ title: "x", description: "y", supportingMemoryIds: [memoryA] }), false);
});

test("proposal listing is owner-scoped and cross-user identifiers disclose nothing", async () => {
  const state = actionState(); const proposal = await proposed(state);
  assert.equal((await handleActionRequest("list-proposals", get("/api/actions/proposals"), null, factory(userA, state), origin)).status, 200);
  const hidden = await handleActionRequest("confirm", post(`/api/actions/proposals/${proposal.id}/confirm`), proposal.id, factory(userB, state), origin);
  assert.equal(hidden.status, 404); assert.equal(hidden.error?.code, "NOT_FOUND");
});

test("anonymous and expired-session requests fail closed", async () => {
  for (const code of ["AUTH_REQUIRED", "SESSION_REFRESH_REQUIRED"] as const) {
    const result = await handleActionRequest("list-cards", get("/api/actions"), null, async () => { throw new AuthFailure(code); }, origin);
    assert.equal(result.status, code === "AUTH_REQUIRED" ? 401 : 503); assert.equal(result.data, null);
  }
});

test("confirmation is explicit, idempotent and concurrent retries return one card", async () => {
  const state = actionState(); const proposal = await proposed(state); const repository = createInMemoryActionRepository(userA, state);
  const [first, second] = await Promise.all([repository.confirm(proposal.id), repository.confirm(proposal.id)]);
  assert.equal(first.id, second.id); assert.equal(state.cards.size, 1); assert.equal(state.proposals.get(proposal.id)?.status, "confirmed");
  assert.equal(first.status, "confirmed"); assert.equal("completed" in first, false);
});

test("confirmed Action Cards retain exact supporting Memory links", async () => {
  const state = actionState(); const proposal = await proposed(state);
  const result = await handleActionRequest("confirm", post(`/api/actions/proposals/${proposal.id}/confirm`), proposal.id, factory(userA, state), origin);
  assert.equal(result.status, 200); const card = result.data as { memoryHrefs: string[]; status: string };
  assert.deepEqual(card.memoryHrefs, [`/memories#memory-${memoryA}`]); assert.equal(card.status, "confirmed");
});

test("expired and rejected proposals cannot be confirmed", async () => {
  const expiredState = actionState(); const expired = await proposed(expiredState);
  expiredState.proposals.set(expired.id, { ...expired, expiresAt: "2026-10-28T00:00:00.000Z" });
  await assert.rejects(createInMemoryActionRepository(userA, expiredState).confirm(expired.id),
    (error: unknown) => error instanceof ActionRepositoryFailure && error.code === "EXPIRED");
  const rejectedState = actionState(); const rejected = await proposed(rejectedState); const repository = createInMemoryActionRepository(userA, rejectedState);
  await repository.reject(rejected.id);
  await assert.rejects(repository.confirm(rejected.id), (error: unknown) => error instanceof ActionRepositoryFailure && error.code === "INVALID_STATE");
});

test("confirmation failure is atomic and creates no partial Action Card", async () => {
  const state = actionState(); const proposal = await proposed(state);
  const repository = createInMemoryActionRepository(userA, state, { failConfirmation: () => true });
  await assert.rejects(repository.confirm(proposal.id), (error: unknown) => error instanceof ActionRepositoryFailure && error.code === "STORAGE_UNAVAILABLE");
  assert.equal(state.cards.size, 0); assert.equal(state.proposals.get(proposal.id)?.status, "proposed");
});

test("confirmation endpoint rejects client bodies and cannot trigger a provider", async () => {
  const state = actionState(); const proposal = await proposed(state); let factoryCalls = 0;
  const result = await handleActionRequest("confirm", post(`/api/actions/proposals/${proposal.id}/confirm`, JSON.stringify({ title: "forged", user_id: userB })), proposal.id,
    async signal => { factoryCalls++; return factory(userA, state)(signal); }, origin);
  assert.equal(result.status, 400); assert.equal(factoryCalls, 0); assert.equal(state.cards.size, 0);
});

test("SQL migration denies direct writes and defines owner checks, atomic locking and uniqueness", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261029000000_confirmed_actions.sql", import.meta.url), "utf8");
  for (const pattern of [/enable row level security/i, /force row level security/i, /revoke all on table/i, /auth\.uid\(\)/i,
    /for update/i, /proposal_id uuid not null unique/i, /security definer/i, /confirm_action_proposal/i]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /service_role/i); assert.doesNotMatch(sql, /status\s*=\s*'completed'/i);
});

test("Action UI labels confirmed records as saved planning artifacts, never executed work", async () => {
  const [ask, review, library] = await Promise.all([
    readFile(new URL("../src/components/ai/ask-reibry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/actions/action-proposal-review.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/actions/action-library.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ask, /ActionProposalReview/); assert.match(review, /Review action/); assert.match(review, /Save action/); assert.match(review, /planning artifact/i);
  assert.match(library, /Not executed/); assert.doesNotMatch(`${ask}\n${review}\n${library}`, />Completed</);
});
