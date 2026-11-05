// Stage 12I-1B: which saved Memory does the user mean? Deterministic reference resolution through the real Home handler and the real
// conversation reasoner with a scripted (mock) Meta transport. No network. The scripted model cites whatever REIBRY marked as resolved.
import assert from "node:assert/strict";
import test from "node:test";
import { META_MODEL, type GroundedModelAnswer } from "../src/lib/ai/meta/contracts.ts";
import { createConversationReasoner } from "../src/lib/ai/meta/grounded-reasoning.ts";
import { createInMemoryAskRateLimiter } from "../src/lib/ai/rate-limit.ts";
import { handleHomeRequest } from "../src/lib/home/handler.ts";
import { savedPeriod } from "../src/lib/home/references.ts";
import type { JsonValue, Memory } from "../src/lib/memory/contracts.ts";
import { createActionTestState, createInMemoryActionRepository } from "./support/in-memory-action-repository.ts";
import { createInMemoryLifeRepository, createLifeTestState } from "./support/in-memory-life-repository.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";

const origin = "http://localhost:3000"; const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-10-31T10:00:00.000Z");
const id = (n: number) => `40000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const link = (n: number, title: string, createdAt: string, metadata: Record<string, JsonValue>, rawText: string | null = null, owner = userA): Memory => ({ id: id(n), userId: owner,
  title, sourceType: "link", sourceUrl: typeof metadata.normalizedUrl === "string" ? metadata.normalizedUrl : null, rawText, analysisStatus: "complete", metadata, createdAt, updatedAt: createdAt });
const text = (n: number, title: string, rawText: string, createdAt: string, owner = userA): Memory => ({ id: id(n), userId: owner, title, sourceType: "text", sourceUrl: null, rawText,
  analysisStatus: "complete", metadata: {}, createdAt, updatedAt: createdAt });
const yt = (video: string, author: string, extra: Record<string, JsonValue> = {}) => ({ capture: "link", platform: "youtube", normalizedUrl: `https://www.youtube.com/watch?v=${video}`,
  enrichment: "complete", author, ...extra });

// Mirrors the live 12I-1 data: an older course saved twice (one copy from before postId existed), two other Python items, the new Mosh course.
const fcc = link(1, "Learn Python - Full Course for Beginners [Tutorial]", "2026-09-15T12:00:00.000Z", yt("rfscVS0vtbw", "freeCodeCamp.org", { postId: "rfscVS0vtbw" }));
const fccAgain = link(2, "Learn Python - Full Course for Beginners [Tutorial]", "2026-10-30T20:00:00.000Z", yt("rfscVS0vtbw", "freeCodeCamp.org", { normalizedUrl: "https://www.youtube.com/watch?si=share&v=rfscVS0vtbw" }));
const corey = link(3, "Python Tutorial for Beginners", "2026-10-20T12:00:00.000Z", yt("YYXdXT2l-Gg", "Corey Schafer", { postId: "YYXdXT2l-Gg" }));
const fastapi = text(4, "[Synthetic] Python course note", "FastAPI course: one module per evening, starting with routing.", "2026-10-28T12:00:00.000Z");
const mosh = link(5, "Python for Beginners - Learn Coding with Python in 1 Hour", "2026-10-31T09:58:00.000Z", yt("kqtD5dpn9C8", "Programming with Mosh", { postId: "kqtD5dpn9C8" }),
  "want to try this before the FastAPI course");
const lemon = link(6, "[Synthetic] Lemon cake decorating video", "2026-10-29T12:00:00.000Z", { capture: "link", platform: "web", normalizedUrl: "https://videos.example.com/watch/lemon-cake" });
const starter = text(7, "Sourdough starter guide", "Feed the starter twice a day.", "2026-10-31T09:40:00.000Z");
const sourdough = link(8, "Sourdough baking video", "2026-10-31T09:41:00.000Z", { capture: "link", platform: "web", normalizedUrl: "https://videos.example.com/watch/sourdough" });
const placeholder = link(9, "YouTube video", "2026-10-31T09:59:30.000Z", { capture: "link", platform: "youtube", normalizedUrl: "https://www.youtube.com/watch?v=pendingVid01",
  enrichment: "pending", postId: "pendingVid01", provenance: { title: "reibry-placeholder" } });
const foreign = text(10, "B private Python course", "Rooftop Python bootcamp invite.", "2026-10-31T09:59:00.000Z", userB);
const deletedId = id(11);
const base = [fcc, fccAgain, corey, fastapi, mosh, lemon, starter, sourdough, foreign];

type Evidence = { memory_id: string; title: string; reference_hint: string | null; times_saved: number; saved_at: string | null; shown_earlier_position: number | null };
type Sent = { evidence: Evidence[]; resolution: string | null; instructions: string };
function harness(seed: Memory[], script: (sent: Sent) => GroundedModelAnswer = cite) {
  const sent: Sent[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { instructions: string; input: Array<{ content: Array<{ text: string }> }> };
    const raw = body.input[body.input.length - 2].content[0].text; const context = JSON.parse(raw.slice(raw.indexOf("\n") + 1));
    const entry = { evidence: context.saved_memory_evidence, resolution: context.reference_resolution, instructions: body.instructions }; sent.push(entry);
    return new Response(JSON.stringify({ id: "resp_ref", status: "completed", store: false, model: META_MODEL, incomplete_details: null,
      output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(script(entry)), annotations: [] }] }],
      usage: { input_tokens: 900, output_tokens: 150, total_tokens: 1050 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const reasoner = createConversationReasoner({ env: { MODEL_API_KEY: "LLM_test_synthetic-only-key", META_RATE_LIMIT_MODE: "in-memory" }, fetch: fetchImpl, sleep: async () => {}, random: () => 0 });
  const value = { userId: userA, memoryRepository: createInMemoryMemoryRepository(userA, createMemoryTestState(seed)),
    lifeRepository: createInMemoryLifeRepository(userA, createLifeTestState([]), { now: () => now.toISOString() }),
    actionRepository: createInMemoryActionRepository(userA, createActionTestState(seed.map(item => [item.id, item.userId])), { now: () => now.toISOString() }) };
  const ask = (message: string, references: string[] = [], history: Array<{ role: string; text: string }> = []) => handleHomeRequest(new Request(`${origin}/api/home`, { method: "POST",
    headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" }, body: JSON.stringify({ message, timezone: "Africa/Lagos", references, history }) }),
    async () => value, reasoner, createInMemoryAskRateLimiter(50), origin, 5_000, () => now);
  return { sent, ask };
}
/** A model that answers about the item REIBRY resolved (or asks when nothing was resolved). */
function cite(sent: Sent): GroundedModelAnswer {
  const target = sent.evidence.find(item => item.reference_hint);
  return target ? { answer: `From the saved title: ${target.title}.`, evidence_status: "supported", cited_memory_ids: [target.memory_id], proposed_next_steps: [] }
    : { answer: `Which one do you mean: ${sent.evidence.map(item => item.title).join(" or ")}?`, evidence_status: "not_needed", cited_memory_ids: [], proposed_next_steps: [] };
}
const ids = (sent: Sent) => sent.evidence.map(item => item.memory_id);

test("newly saved course + two older Python courses: 'just saved' resolves to the new one, first, and is the citation", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("Find that Python course I just saved.");
  assert.equal(sent[0].resolution, "most-recent-match"); assert.equal(sent[0].evidence[0].memory_id, mosh.id);
  assert.equal(sent[0].evidence[0].reference_hint, "most-recently-saved-match"); assert.equal(sent[0].evidence[0].saved_at, mosh.createdAt);
  assert.ok(ids(sent[0]).includes(fccAgain.id) && ids(sent[0]).includes(fastapi.id), "the two older Python courses stay available");
  assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, mosh.id); assert.equal(result.data?.groundedAnswer?.citations[0].memory_href, `/memories#memory-${mosh.id}`);
});
test("live 12I-1 replay: duplicate copies of one video are sent once, as the newest real Memory, with times_saved", async () => {
  const { sent, ask } = harness(base);
  await ask("Find that Python course I just saved.");
  const copies = sent[0].evidence.filter(item => item.title.startsWith("Learn Python - Full Course"));
  assert.equal(copies.length, 1); assert.equal(copies[0].memory_id, fccAgain.id); assert.equal(copies[0].times_saved, 2);
  assert.equal(new Set(ids(sent[0])).size, ids(sent[0]).length);
});
test("two relevant Memories saved close together: the later one leads, the other is still offered", async () => {
  const { sent, ask } = harness(base);
  await ask("What was that sourdough thing I just saved?");
  assert.equal(sent[0].evidence[0].memory_id, sourdough.id); assert.ok(ids(sent[0]).includes(starter.id));
});
test("'the second one' resolves against the previously displayed order, not a new search order", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("Tell me more about the second one", [corey.id, mosh.id, fastapi.id]);
  assert.equal(sent[0].resolution, "shown-position:2"); assert.equal(sent[0].evidence[0].memory_id, mosh.id);
  assert.equal(sent[0].evidence[0].shown_earlier_position, 2); assert.equal(sent[0].evidence[0].reference_hint, "user-selected-shown-position");
  assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, mosh.id);
});
test("explicit creator correction: 'the Programming with Mosh one' beats the cited item and weak 'plan' matches", async () => {
  const { sent, ask } = harness([...base, text(12, "[Synthetic] Study plan note", "Revise SQL joins on Monday.", "2026-10-30T09:00:00.000Z")]);
  const result = await ask("No, I meant the Programming with Mosh one. Can you help me plan learning from it?", [fccAgain.id],
    [{ role: "user", text: "What do you actually know about that video?" }, { role: "assistant", text: "From the saved title: Learn Python - Full Course for Beginners." }]);
  assert.equal(sent[0].resolution, "named"); assert.equal(sent[0].evidence[0].memory_id, mosh.id); assert.equal(sent[0].evidence[0].reference_hint, "named-in-message");
  assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, mosh.id);
  const short = harness(base); await short.ask("What about the Mosh course?"); assert.equal(short.sent[0].evidence[0].memory_id, mosh.id);
});
test("recently captured item with weak metadata: the placeholder save is offered even though it matches no words", async () => {
  const { sent, ask } = harness([...base, placeholder]);
  await ask("Find that Python course I just saved.");
  const weak = sent[0].evidence.find(item => item.memory_id === placeholder.id);
  assert.equal(weak?.reference_hint, "most-recently-saved-overall"); assert.equal(sent[0].evidence[0].memory_id, mosh.id, "the newest real match still leads");
  const only = harness([fcc, placeholder]); await only.ask("Find the course I just saved");
  assert.ok(ids(only.sent[0]).includes(placeholder.id));
});
test("'that one' with one item under discussion resolves to it; generic 'video' matches are not mixed in", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("What do you actually know about that video?", [mosh.id]);
  assert.equal(sent[0].resolution, "conversation"); assert.deepEqual(ids(sent[0]), [mosh.id]); assert.ok(!ids(sent[0]).includes(lemon.id) && !ids(sent[0]).includes(sourdough.id));
  assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, mosh.id);
});
test("ambiguous 'that one' across several shown items: no guess, the model is told to clarify", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("What do you know about that one?", [corey.id, mosh.id]);
  assert.equal(sent[0].resolution, "ambiguous-conversation"); assert.deepEqual(ids(sent[0]), [corey.id, mosh.id]);
  assert.ok(sent[0].evidence.every(item => item.reference_hint === null)); assert.match(sent[0].instructions, /ask one short question naming them instead of guessing/);
  assert.match(result.data?.message || "", /\?$/); assert.equal(result.data?.groundedAnswer?.citations.length, 0);
});
test("older item with an explicit date: 'from last month' uses the September copy, not simply the newest", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("What was the Python course I saved last month?");
  assert.match(sent[0].resolution ?? "", /^saved-period:last month:2026-09-01\.\.2026-09-30$/);
  assert.equal(sent[0].evidence[0].memory_id, fcc.id); assert.equal(sent[0].evidence[0].saved_at, fcc.createdAt);
  assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, fcc.id);
  const none = harness(base); await none.ask("Did I save a sourdough guide last month?"); assert.match(none.sent[0].resolution ?? "", /:none-matched$/);
});
test("saved periods use the user's local calendar", () => {
  assert.deepEqual(savedPeriod("last month", new Date("2026-10-31T23:30:00.000Z"), "Africa/Lagos"), { label: "last month", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(savedPeriod("last week", new Date("2026-10-31T10:00:00.000Z"), "Africa/Lagos"), { label: "last week", from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(savedPeriod("yesterday", new Date("2026-10-31T10:00:00.000Z"), "UTC"), { label: "yesterday", from: "2026-10-30", to: "2026-10-30" });
});
test("cross-user Memory ID injection: another user's ID is never evidence, never resolved, never cited", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("Tell me about the first one", [foreign.id, mosh.id]);
  assert.ok(!ids(sent[0]).includes(foreign.id)); assert.equal(sent[0].evidence.find(item => item.reference_hint)?.memory_id, undefined, "position 1 was the foreign ID");
  assert.ok(!JSON.stringify(sent[0]).includes("Rooftop")); assert.ok(!(result.data?.groundedAnswer?.citations ?? []).some(item => item.memory_id === foreign.id));
  const named = harness(base); await named.ask("Find that Python course I just saved."); assert.ok(!ids(named.sent[0]).includes(foreign.id), "the other user's newer save is not 'most recent'");
});
test("previously deleted Memory reference: dropped, and the remaining items keep the positions the user saw", async () => {
  const { sent, ask } = harness(base);
  const result = await ask("Tell me about the second one", [deletedId, mosh.id]);
  assert.ok(!ids(sent[0]).includes(deletedId)); assert.equal(sent[0].evidence[0].memory_id, mosh.id); assert.equal(sent[0].evidence[0].shown_earlier_position, 2);
  assert.equal(result.data?.groundedAnswer?.citations[0].memory_id, mosh.id);
  const first = harness(base); await first.ask("Tell me about the first one", [deletedId, mosh.id]); assert.equal(first.sent[0].resolution, null);
});
test("a citation of a duplicate copy that was not sent as evidence is rejected, never shown", async () => {
  const { ask } = harness(base, () => ({ answer: "From the saved title: Learn Python.", evidence_status: "supported", cited_memory_ids: [fcc.id], proposed_next_steps: [] }));
  const result = await ask("Find that Python course I just saved.");
  assert.equal(result.data?.groundedAnswer, null); assert.equal(result.data?.fallbackReason, "META_INVALID_RESPONSE:citation_mismatch");
});
test("Home UI: after a clarifying reply with no cards, follow-ups still reference the cards shown before it", async () => {
  const source = await (await import("node:fs/promises")).readFile("src/components/home/home-conversation.tsx", "utf8");
  assert.match(source, /for \(const turn of \[\.\.\.turns\]\.reverse\(\)\) \{[\s\S]*?if \(shown\.length\) return shown\.slice\(0, HOME_REFERENCES_MAX\);/);
});
