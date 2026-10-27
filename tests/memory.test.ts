import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthFailure } from "../src/lib/auth/policy.ts";
import { decodeMemory, memoryId, parseCreateMemory, parseMemoryList, parseUpdateMemory, serializeMemory, type Memory } from "../src/lib/memory/contracts.ts";
import { handleMemoryRequest, type MemoryContextFactory } from "../src/lib/memory/handler.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../src/lib/memory/repository.ts";
import { createSupabaseMemoryRepository } from "../src/lib/memory/supabase-repository.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const origin = "http://localhost:3000";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";
const at = "2026-10-27T10:00:00.000Z";
function memory(id: string, userId: string, createdAt = at): Memory {
  return { id, userId, title: id, sourceType: "text", sourceUrl: null, rawText: id, analysisStatus: "processing",
    metadata: {}, createdAt, updatedAt: createdAt };
}
function request(method: string, path = "/api/memories", body?: unknown, requestOrigin = origin) {
  return new Request(origin + path, { method, headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
function context(repository: MemoryRepository): MemoryContextFactory {
  return async () => ({ userId: repository.ownerId, repository });
}

test("Memory contracts preserve original text, derive a title and serialize stable fields", () => {
  const input = parseCreateMemory({ sourceType: "text", rawText: "  First line\nSecond line  " });
  assert.equal(input.title, "First line"); assert.equal(input.rawText, "  First line\nSecond line  ");
  assert.deepEqual(Object.keys(serializeMemory(memory(idA, userA))), ["id", "userId", "title", "sourceType", "sourceUrl", "rawText", "analysisStatus", "metadata", "createdAt", "updatedAt"]);
  assert.equal(decodeMemory({ id: idA, user_id: userA, title: "Note", source_type: "text", source_url: null,
    raw_text: "Text", analysis_status: "processing", metadata: {}, created_at: at, updated_at: at }).userId, userA);
  assert.equal(memoryId(idA.toUpperCase()), idA);
});
test("create and update validation reject empty, oversized, forged and unsupported fields", () => {
  for (const value of [{ rawText: "" }, { rawText: "x".repeat(50_001) }, { rawText: "ok", userId: userB },
    { rawText: "ok", sourceType: "link" }]) assert.throws(() => parseCreateMemory(value));
  for (const value of [{}, { title: "" }, { rawText: "ok", analysisStatus: "complete" }]) assert.throws(() => parseUpdateMemory(value));
  assert.deepEqual(parseUpdateMemory({ title: " Renamed " }), { title: "Renamed" });
});
test("list validation bounds pagination and rejects unknown filters", () => {
  assert.deepEqual(parseMemoryList(new URL(origin + "/api/memories")), { limit: 20, offset: 0 });
  assert.deepEqual(parseMemoryList(new URL(origin + "/api/memories?limit=50&offset=5000")), { limit: 50, offset: 5000 });
  for (const query of ["limit=0", "limit=51", "offset=5001", "offset=-1", "search=private"])
    assert.throws(() => parseMemoryList(new URL(origin + "/api/memories?" + query)));
});
test("authenticated creation takes ownership only from verified context", async () => {
  const state = createMemoryTestState(); const repository = createInMemoryMemoryRepository(userA, state);
  const result = await handleMemoryRequest("create", request("POST", "/api/memories", { rawText: "Private note" }), null, context(repository));
  assert.equal(result.status, 201); assert.equal((result.data as Memory).userId, userA); assert.equal(state.size, 1);
  const forged = await handleMemoryRequest("create", request("POST", "/api/memories", { rawText: "Private", userId: userB }), null, context(repository));
  assert.equal(forged.status, 400); assert.equal(state.size, 1);
});
test("empty, oversized, malformed and cross-site creates fail without persistence", async () => {
  const state = createMemoryTestState(); const repository = createInMemoryMemoryRepository(userA, state);
  assert.equal((await handleMemoryRequest("create", request("POST", "/api/memories", { rawText: "" }), null, context(repository))).status, 400);
  assert.equal((await handleMemoryRequest("create", request("POST", "/api/memories", { rawText: "x".repeat(70_000) }), null, context(repository))).status, 400);
  assert.equal((await handleMemoryRequest("create", request("POST", "/api/memories", { rawText: "ok" }, "https://outside.test"), null, context(repository))).status, 403);
  assert.equal(state.size, 0);
});
test("owner-bound repositories deny cross-user read, update and delete", async () => {
  const state = createMemoryTestState([memory(idA, userA), memory(idB, userB)]);
  const repository = createInMemoryMemoryRepository(userA, state); const factory = context(repository);
  for (const [operation, method] of [["read", "GET"], ["update", "PATCH"], ["delete", "DELETE"]] as const) {
    const body = operation === "update" ? { title: "forbidden" } : undefined;
    const result = await handleMemoryRequest(operation, request(method, "/api/memories/" + idB, body), idB, factory);
    assert.equal(result.status, 404);
  }
  assert.equal(state.get(idB)?.title, idB);
});
test("owned updates validate fields and delete removes only the owned record", async () => {
  const state = createMemoryTestState([memory(idA, userA), memory(idB, userB)]);
  const factory = context(createInMemoryMemoryRepository(userA, state));
  const invalid = await handleMemoryRequest("update", request("PATCH", "/api/memories/" + idA, { title: "" }), idA, factory);
  assert.equal(invalid.status, 400);
  const updated = await handleMemoryRequest("update", request("PATCH", "/api/memories/" + idA, { title: "Renamed" }), idA, factory);
  assert.equal(updated.status, 200); assert.equal((updated.data as Memory).title, "Renamed");
  assert.equal((await handleMemoryRequest("delete", request("DELETE", "/api/memories/" + idA), idA, factory)).status, 200);
  assert.equal(state.has(idA), false); assert.equal(state.has(idB), true);
});
test("list ordering is stable, owner scoped and paginated", async () => {
  const state = createMemoryTestState([memory(idA, userA, "2026-10-27T09:00:00.000Z"), memory(idB, userB, "2026-10-27T12:00:00.000Z"),
    memory("33333333-3333-4333-8333-333333333333", userA, "2026-10-27T11:00:00.000Z")]);
  const factory = context(createInMemoryMemoryRepository(userA, state));
  const first = await handleMemoryRequest("list", new Request(origin + "/api/memories?limit=1"), null, factory);
  const page = first.data as { items: Memory[]; nextOffset: number | null };
  assert.equal(page.items.length, 1); assert.equal(page.items[0].id, "33333333-3333-4333-8333-333333333333"); assert.equal(page.nextOffset, 1);
  const second = await handleMemoryRequest("list", new Request(origin + "/api/memories?limit=1&offset=1"), null, factory);
  assert.deepEqual((second.data as { items: Memory[] }).items.map(item => item.id), [idA]);
});
test("unauthenticated, expired, mismatched and unavailable contexts fail closed", async () => {
  const repository = createInMemoryMemoryRepository(userA, createMemoryTestState());
  for (const failure of [new AuthFailure("AUTH_REQUIRED"), new AuthFailure("AUTH_NOT_CONFIGURED")]) {
    const result = await handleMemoryRequest("list", new Request(origin + "/api/memories"), null, async () => { throw failure; });
    assert.equal(result.status, failure.code === "AUTH_REQUIRED" ? 401 : 503);
  }
  const mismatch = await handleMemoryRequest("list", new Request(origin + "/api/memories"), null, async () => ({ userId: userB, repository }));
  assert.equal(mismatch.status, 401);
  const unavailable = await handleMemoryRequest("list", new Request(origin + "/api/memories"), null, async () => ({ userId: userA,
    repository: { ...repository, list: async () => { throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); } } }));
  assert.equal(unavailable.status, 503); assert.doesNotMatch(JSON.stringify(unavailable), /database|provider|private/i);
});
test("Memory session and storage work is bounded", async () => {
  const result = await handleMemoryRequest("list", new Request(origin + "/api/memories"), null, async () => new Promise(() => {}), origin, 10);
  assert.equal(result.status, 504); assert.equal(result.error?.code, "AUTH_TIMEOUT");
});

class FakeQuery {
  calls: Array<[string, ...unknown[]]> = [];
  private response: { data: unknown; error: unknown };
  constructor(response: { data: unknown; error: unknown }) { this.response = response; }
  select(...args: unknown[]) { this.calls.push(["select", ...args]); return this; }
  insert(...args: unknown[]) { this.calls.push(["insert", ...args]); return this; }
  update(...args: unknown[]) { this.calls.push(["update", ...args]); return this; }
  delete(...args: unknown[]) { this.calls.push(["delete", ...args]); return this; }
  eq(...args: unknown[]) { this.calls.push(["eq", ...args]); return this; }
  order(...args: unknown[]) { this.calls.push(["order", ...args]); return this; }
  range(...args: unknown[]) { this.calls.push(["range", ...args]); return Promise.resolve(this.response); }
  single() { this.calls.push(["single"]); return Promise.resolve(this.response); }
  maybeSingle() { this.calls.push(["maybeSingle"]); return Promise.resolve(this.response); }
}
test("Supabase adapter writes and filters the verified owner without elevated access", async () => {
  const row = { id: idA, user_id: userA, title: "Owned", source_type: "text", source_url: null, raw_text: "Owned",
    analysis_status: "processing", metadata: {}, created_at: at, updated_at: at };
  const queries: FakeQuery[] = [];
  const client = { from: () => { const query = new FakeQuery({ data: row, error: null }); queries.push(query); return query; } } as unknown as SupabaseClient;
  const repository = createSupabaseMemoryRepository(client, userA);
  await repository.create({ title: "Owned", rawText: "Owned" }); await repository.read(idA);
  const insert = queries[0].calls.find(call => call[0] === "insert")?.[1] as Record<string, unknown>;
  assert.equal(insert.user_id, userA); assert.equal(insert.analysis_status, "processing");
  assert.ok(queries[1].calls.some(call => call[0] === "eq" && call[1] === "user_id" && call[2] === userA));
  assert.equal("service_role" in insert, false);
});
test("production modules have no mock persistence fallback", async () => {
  const files = ["src/lib/memory/server.ts", "src/lib/memory/supabase-repository.ts", "src/app/api/memories/route.ts"];
  for (const file of files) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /tests\/support|in-memory|MEMORY_MOCK|service.?role/i);
  }
});
test("migration defines owner RLS, minimal grants and no vector dependency", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261027000000_memory_foundation.sql", import.meta.url), "utf8");
  for (const fragment of ["enable row level security", "force row level security", "memory_owner_select", "memory_owner_insert",
    "memory_owner_update", "memory_owner_delete", "auth.uid()", "revoke all on table public.memories from public, anon, authenticated",
    "grant update (title, raw_text)", "memories_owner_created_id_idx"])
    assert.ok(sql.toLowerCase().includes(fragment), fragment);
  assert.doesNotMatch(sql, /service_role|create extension|\bvector\b/i);
});
