import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthFailure } from "../src/lib/auth/policy.ts";
import type { Memory } from "../src/lib/memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../src/lib/memory/repository.ts";
import { parseSearchRequest, RetrievalContractError, validateRetrievalItem, type RetrievalResponse } from "../src/lib/retrieval/contracts.ts";
import { handleRetrievalRequest, type RetrievalContextFactory } from "../src/lib/retrieval/handler.ts";
import { normalizeQuery, rankMemories, searchOwnedMemories } from "../src/lib/retrieval/service.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";

const origin = "http://localhost:3000";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const baseTime = "2026-10-29T10:00:00.000Z";
let sequence = 1;
function memory(overrides: Partial<Memory> = {}): Memory {
  const id = `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
  return { id, userId: userA, title: "Saved Memory", sourceType: "text", sourceUrl: null, rawText: "Stored evidence only",
    analysisStatus: "processing", metadata: {}, createdAt: baseTime, updatedAt: baseTime, ...overrides };
}
function repo(ownerId: string, memories: Memory[]) { return createInMemoryMemoryRepository(ownerId, createMemoryTestState(memories)); }
function context(repository: MemoryRepository): RetrievalContextFactory { return async () => ({ userId: repository.ownerId, repository }); }
function request(query = "saved", method = "GET") { return new Request(`${origin}/api/memories/search?q=${encodeURIComponent(query)}&limit=10`, { method }); }

test("query normalization is deterministic across case, Unicode form and whitespace", () => {
  assert.deepEqual(normalizeQuery("  VANILLA\u00a0  Cake!  "), { phrase: "vanilla cake", terms: ["vanilla", "cake"] });
  assert.deepEqual(normalizeQuery("the cake and the recipe").terms, ["cake", "recipe"]);
});

test("search request validates empty, oversized, unknown and invalid-limit input", () => {
  for (const url of [`${origin}/api/memories/search`, `${origin}/api/memories/search?q=`,
    `${origin}/api/memories/search?q=${"x".repeat(201)}`, `${origin}/api/memories/search?q=ok&user_id=${userB}`,
    `${origin}/api/memories/search?q=ok&limit=0`, `${origin}/api/memories/search?q=ok&limit=21`])
    assert.throws(() => parseSearchRequest(new URL(url)), RetrievalContractError);
  assert.deepEqual(parseSearchRequest(new URL(`${origin}/api/memories/search?q=vanilla&limit=5`)), { query: "vanilla", limit: 5 });
});

test("exact title match produces validated stored evidence and an exact owned anchor", () => {
  const saved = memory({ title: "Vanilla Cake Recipe" }); const response = rankMemories([saved], "vanilla cake recipe", 10);
  assert.equal(response.state, "matches"); assert.equal(response.items[0].memoryId, saved.id);
  assert.equal(response.items[0].memoryHref, `/memories#memory-${saved.id}`); assert.ok(response.items[0].match.score >= 90);
  assert.equal(validateRetrievalItem(response.items[0]), response.items[0]);
});

test("phrase match returns a bounded excerpt copied from saved note text", () => {
  const rawText = `Private preface ${"x".repeat(120)} exact pastry technique with chilled butter and flour after the preface.`;
  const item = rankMemories([memory({ title: "Kitchen note", rawText })], "exact pastry technique", 10).items[0];
  assert.match(item.storedExcerpt || "", /exact pastry technique/); assert.ok((item.storedExcerpt?.length || 0) <= 280);
  assert.deepEqual(item.match.fields, ["note"]);
});

test("multi-word queries match across permitted stored fields", () => {
  const item = rankMemories([memory({ title: "Lagos plans", rawText: "Budget notes for a weekend trip" })], "lagos budget", 10).items[0];
  assert.deepEqual(item.match.fields, ["title", "note"]); assert.match(item.match.reason, /Multiple stored fields/);
});

test("strong title evidence ranks above a weaker note-only match", () => {
  const weak = memory({ title: "General ideas", rawText: "A vanilla cake is mentioned here." });
  const strong = memory({ title: "Vanilla Cake", rawText: "Recipe" });
  assert.deepEqual(rankMemories([weak, strong], "vanilla cake", 10).items.map(item => item.memoryId), [strong.id, weak.id]);
});

test("unrelated Memories are excluded instead of padding a result quota", () => {
  const related = memory({ title: "Python API notes" }); const unrelated = memory({ title: "Garden list", rawText: "Buy soil" });
  const result = rankMemories([unrelated, related], "python", 10);
  assert.deepEqual(result.items.map(item => item.memoryId), [related.id]);
});

test("no supporting evidence returns an explicit empty no-match response", () => {
  assert.deepEqual(rankMemories([memory({ title: "Travel list" })], "quantum", 10), { query: "quantum", state: "no-match", items: [] });
});

test("metadata-only link matches only stored metadata and never implies page contents", () => {
  const saved = memory({ sourceType: "link", sourceUrl: "https://www.youtube.com/watch?v=x", rawText: null, title: "Saved video",
    metadata: { platform: "youtube", author: "Ada Baker", metadataProvider: "youtube-oembed" } });
  const item = rankMemories([saved], "ada baker", 10).items[0];
  assert.equal(item.storedExcerpt, null); assert.deepEqual(item.match.fields, ["metadata"]);
  assert.deepEqual(item.matchedSourceMetadata, ["Ada Baker"]);
  assert.equal("transcript" in item, false); assert.equal("summary" in item, false);
});

test("unenriched links remain searchable by saved hostname without invented content", () => {
  const saved = memory({ sourceType: "link", sourceUrl: "https://docs.example.com/guide", rawText: null, title: "docs.example.com",
    metadata: { enrichment: "unsupported", platform: "web" } });
  const item = rankMemories([saved], "example", 10).items[0];
  assert.equal(item.sourceUrl, saved.sourceUrl); assert.equal(item.storedExcerpt, null); assert.ok(item.match.fields.includes("hostname"));
});

test("processing-state Memories remain searchable", () => {
  const item = rankMemories([memory({ title: "Unprocessed evidence", analysisStatus: "processing" })], "unprocessed", 10).items[0];
  assert.equal(item.processingStatus, "processing");
});

test("ties are stable by newest timestamp then Memory ID", () => {
  const later = "2026-10-29T11:00:00.000Z"; const one = memory({ title: "Shared term", createdAt: baseTime });
  const two = memory({ title: "Shared term", createdAt: later }); const three = memory({ title: "Shared term", createdAt: later });
  assert.deepEqual(rankMemories([three, one, two], "shared", 10).items.map(item => item.memoryId), [two.id, three.id, one.id]);
});

test("configured result limit is enforced without unrelated fill", () => {
  const items = Array.from({ length: 5 }, (_, index) => memory({ title: `Matching note ${index}` }));
  assert.equal(rankMemories(items, "matching", 2).items.length, 2);
});

test("owner-bound candidate loading cannot expose another user's matching Memory", async () => {
  const own = memory({ userId: userA, title: "Owner A apple" }); const other = memory({ userId: userB, title: "Owner B apple" });
  const result = await searchOwnedMemories(repo(userA, [own, other]), "apple", 10);
  assert.deepEqual(result.items.map(item => item.memoryId), [own.id]);
});

test("anonymous and expired sessions are rejected", async () => {
  for (const failure of [new AuthFailure("AUTH_REQUIRED"), new AuthFailure("AUTH_REQUIRED")]) {
    const result = await handleRetrievalRequest(request(), async () => { throw failure; });
    assert.equal(result.status, 401); assert.equal(result.error?.code, "AUTH_REQUIRED");
  }
});

test("session timeout and mismatched repository ownership fail closed", async () => {
  const timeout = await handleRetrievalRequest(request(), async () => new Promise(() => {}), 10);
  assert.equal(timeout.status, 504); assert.equal(timeout.error?.code, "AUTH_TIMEOUT");
  const repository = repo(userA, []); const mismatch = await handleRetrievalRequest(request(), async () => ({ userId: userB, repository }));
  assert.equal(mismatch.status, 401);
});

test("database failures return a safe error without content or provider details", async () => {
  const repository = repo(userA, []); repository.searchCandidates = async () => { throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); };
  const result = await handleRetrievalRequest(request("private phrase"), context(repository));
  assert.equal(result.status, 503); assert.equal(result.error?.code, "STORAGE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(result), /private phrase|database|supabase/i);
});

test("search handler accepts only GET and derives results from repository context", async () => {
  const repository = repo(userA, [memory({ title: "Owned result" })]);
  const result = await handleRetrievalRequest(request("owned"), context(repository));
  assert.equal(result.status, 200); assert.equal((result.data as RetrievalResponse).items.length, 1);
  assert.equal((await handleRetrievalRequest(request("owned", "POST"), context(repository))).status, 405);
});

test("candidate scan is bounded to the documented owner-only ceiling", async () => {
  const repository = repo(userA, [memory({ title: "Bounded" })]); let received = 0;
  const original = repository.searchCandidates; repository.searchCandidates = async limit => { received = limit; return original(limit); };
  await searchOwnedMemories(repository, "bounded", 10); assert.equal(received, 250);
});

test("search route is static and production retrieval imports no models, vectors or mocks", async () => {
  const route = await readFile(new URL("../src/app/api/memories/search/route.ts", import.meta.url), "utf8");
  assert.match(route, /retrievalApiRoute/);
  for (const file of ["src/lib/retrieval/service.ts", "src/lib/retrieval/server.ts", "src/lib/retrieval/handler.ts"]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /tests\/support|in-memory|service.?role|embedding|pgvector|gemini|nvidia|nebius|meta.?api/i);
  }
});
