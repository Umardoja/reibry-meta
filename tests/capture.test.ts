import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AuthFailure } from "../src/lib/auth/policy.ts";
import { CaptureContractError, parseCaptureInput } from "../src/lib/capture/contracts.ts";
import { enrichLink, fetchVettedJson, type MetadataFetch } from "../src/lib/capture/enrichment.ts";
import { handleCaptureRequest, type CaptureContextFactory } from "../src/lib/capture/handler.ts";
import { capture } from "../src/lib/capture/service.ts";
import { parsePublicLink, publicAddress } from "../src/lib/capture/url-policy.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../src/lib/memory/repository.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";

const origin = "http://localhost:3000";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const publicDns = async () => [{ address: "8.8.8.8" }];
const offline = async () => ({ status: "unavailable" as const, provider: null, reason: "provider-error", provenance: {} });
function repository(owner = userA) { return createInMemoryMemoryRepository(owner, createMemoryTestState()); }
function context(repo: MemoryRepository): CaptureContextFactory { return async () => ({ userId: repo.ownerId, repository: repo }); }
function request(body: unknown, requestOrigin = origin) { return new Request(origin + "/api/capture", { method: "POST",
  headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function jsonResponse(value: unknown, headers: Record<string, string> = { "content-type": "application/json" }) {
  return new Response(JSON.stringify(value), { status: 200, headers });
}

test("Capture contract accepts bounded note/link input and rejects forged or invalid fields", () => {
  assert.deepEqual(parseCaptureInput({ sourceType: "text", content: "  Original note  " }), { sourceType: "text", content: "Original note" });
  for (const value of [{ sourceType: "text", content: "" }, { sourceType: "text", content: "x".repeat(50_001) },
    { sourceType: "link", content: "https://example.test", userId: userB }, { sourceType: "link", content: "x".repeat(2_049) }])
    assert.throws(() => parseCaptureInput(value), CaptureContractError);
});

test("valid notes preserve original text, use deterministic titles and contain no fabricated analysis", async () => {
  const result = await capture({ sourceType: "text", content: "First line\nSecond line" }, repository());
  assert.equal(result.memory.title, "First line"); assert.equal(result.memory.rawText, "First line\nSecond line");
  assert.equal(result.memory.analysisStatus, "processing"); assert.equal(result.memory.sourceUrl, null);
  assert.equal("summary" in result.memory.metadata, false); assert.equal("analysis" in result.memory.metadata, false);
});

test("public HTTPS link normalization keeps meaningful query values while removing fragments and tracking", () => {
  const link = parsePublicLink("https://Example.com/path?b=two&a=one&utm_source=share&fbclid=x#private-fragment");
  assert.equal(link.normalized, "https://example.com/path?a=one&b=two");
  assert.equal(link.submitted, "https://Example.com/path?b=two&a=one&utm_source=share&fbclid=x#private-fragment");
  // Stage 12I: a YouTube share collapses to its video identity (timestamps and share IDs do not create a separate Memory).
  const youtube = parsePublicLink("https://youtu.be/abc123?t=42");
  assert.equal(youtube.normalized, "https://www.youtube.com/watch?v=abc123"); assert.equal(youtube.identity, "youtube:abc123");
});

test("invalid, non-HTTPS, credentialed, localhost, private and reserved targets are rejected", () => {
  for (const value of ["not a url", "http://example.com", "file:///etc/passwd", "https://user:pass@example.com/",
    "https://localhost/a", "https://service.local/a", "https://127.0.0.1/a", "https://10.0.0.1/a", "https://169.254.169.254/a",
    "https://192.168.1.1/a", "https://[::1]/a", "https://192.0.2.1/a"])
    assert.throws(() => parsePublicLink(value), CaptureContractError, value);
  assert.equal(publicAddress("8.8.8.8"), true); assert.equal(publicAddress("2606:4700:4700::1111"), true);
});

test("generic links are saved even when the vetted page-metadata fetch fails", async () => {
  let calls = 0; const result = await capture({ sourceType: "link", content: "https://example.com/article?q=meaningful" }, repository(),
    async link => { calls++; return enrichLink(link, { resolve: publicDns, fetcher: async () => { throw new Error("network down"); } }); });
  assert.equal(calls, 1); assert.equal(result.enrichment.status, "unavailable"); assert.equal(result.memory.sourceUrl, "https://example.com/article?q=meaningful");
  assert.equal(result.memory.title, "example.com"); assert.equal(result.memory.metadata.provenance && (result.memory.metadata.provenance as Record<string, string>).title, "reibry-placeholder");
});

test("YouTube and TikTok use only fixed oEmbed endpoints and preserve returned safe metadata", async () => {
  for (const [source, expectedHost, provider] of [["https://youtu.be/abc", "www.youtube.com", "youtube-oembed"],
    ["https://www.tiktok.com/@creator/video/1234567890123", "www.tiktok.com", "tiktok-oembed"]] as const) {
    const seen: URL[] = [];
    const result = await capture({ sourceType: "link", content: source }, repository(), link => enrichLink(link, { resolve: publicDns,
      fetcher: async input => { const endpoint = new URL(input.toString()); seen.push(endpoint); return jsonResponse({ title: "Verified source title", author_name: "Creator", thumbnail_url: "https://cdn.example.com/thumb.jpg" }); } }));
    assert.equal(seen.length, 1); assert.equal(seen[0].hostname, expectedHost); assert.equal(result.enrichment.provider, provider);
    assert.equal(result.memory.title, "Verified source title"); assert.equal(result.memory.metadata.author, "Creator");
  }
});

test("metadata DNS resolving private is rejected before fetch", async () => {
  let fetched = false; const endpoint = new URL("https://www.youtube.com/oembed?url=https%3A%2F%2Fyoutu.be%2Fx");
  await assert.rejects(fetchVettedJson(endpoint, { resolve: async () => [{ address: "127.0.0.1" }], fetcher: async () => { fetched = true; return jsonResponse({}); } }));
  assert.equal(fetched, false);
});

test("unsafe redirects, HTTP errors and unsupported content types fail enrichment without following", async () => {
  const endpoint = new URL("https://www.youtube.com/oembed");
  for (const response of [new Response(null, { status: 302, headers: { location: "https://internal.test" } }),
    new Response("down", { status: 503 }), new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })])
    await assert.rejects(fetchVettedJson(endpoint, { resolve: publicDns, fetcher: async () => response }));
});

test("response byte limit is enforced while streaming", async () => {
  const chunk = new Uint8Array(40_000); let pulls = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(chunk); if (pulls === 2) controller.close(); } });
  await assert.rejects(fetchVettedJson(new URL("https://www.youtube.com/oembed"), { resolve: publicDns,
    fetcher: async () => new Response(body, { headers: { "content-type": "application/json" } }) }), /oversized-response/);
  assert.equal(pulls, 2);
});

test("metadata DNS and network work have a bounded total timeout", async () => {
  await assert.rejects(fetchVettedJson(new URL("https://www.youtube.com/oembed"), { resolve: async () => new Promise(() => {}), timeoutMs: 10 }), /timeout/);
  const hanging: MetadataFetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  await assert.rejects(fetchVettedJson(new URL("https://www.youtube.com/oembed"), { resolve: publicDns, fetcher: hanging, timeoutMs: 10 }));
});

test("YouTube/TikTok metadata failures preserve the original link with honest status", async () => {
  for (const source of ["https://youtu.be/abc", "https://www.tiktok.com/@creator/video/1234567890123"]) {
    const result = await capture({ sourceType: "link", content: source }, repository(), link => enrichLink(link, { resolve: publicDns,
      fetcher: async () => new Response("down", { status: 503 }) }));
    assert.equal(result.memory.sourceUrl, source); assert.equal(result.memory.analysisStatus, "processing");
    assert.equal(result.enrichment.status, "unavailable"); assert.equal(result.memory.metadata.enrichment, "unavailable");
  }
});

test("missing optional thumbnail does not downgrade otherwise valid metadata", async () => {
  const result = await capture({ sourceType: "link", content: "https://youtu.be/no-thumbnail" }, repository(), link => enrichLink(link, {
    resolve: publicDns, fetcher: async () => jsonResponse({ title: "Title without artwork", author_name: "Creator" }) }));
  assert.equal(result.enrichment.status, "complete"); assert.equal(result.memory.title, "Title without artwork");
  assert.equal("thumbnailUrl" in result.memory.metadata, false);
});

test("same-owner equivalent links deduplicate atomically, including concurrent requests", async () => {
  const repo = repository(); const source = "https://example.com/path?b=2&a=1";
  const first = await capture({ sourceType: "link", content: source }, repo, offline); const second = await capture({ sourceType: "link", content: "https://EXAMPLE.com/path?a=1&b=2&utm_campaign=x#x" }, repo, offline);
  assert.equal(first.duplicate, false); assert.equal(second.duplicate, true); assert.equal(second.memory.id, first.memory.id);
  const results = await Promise.all([capture({ sourceType: "text", content: "Concurrent note" }, repo), capture({ sourceType: "text", content: "Concurrent note" }, repo)]);
  assert.equal(results.filter(item => item.duplicate).length, 1); assert.equal(results[0].memory.id, results[1].memory.id);
});

test("deduplication is owner scoped and never returns another user's Memory", async () => {
  const state = createMemoryTestState(); const a = createInMemoryMemoryRepository(userA, state); const b = createInMemoryMemoryRepository(userB, state);
  const first = await capture({ sourceType: "link", content: "https://example.com/private" }, a, offline);
  const second = await capture({ sourceType: "link", content: "https://example.com/private" }, b, offline);
  assert.equal(second.duplicate, false); assert.notEqual(second.memory.id, first.memory.id); assert.equal(second.memory.userId, userB);
});

test("capture endpoint authenticates, rejects forged ownership and preserves same-origin boundaries", async () => {
  const repo = repository(); const valid = await handleCaptureRequest(request({ sourceType: "text", content: "Owned note" }), context(repo));
  assert.equal(valid.status, 201); assert.equal((valid.data as { memory: { userId: string } }).memory.userId, userA);
  assert.equal((await handleCaptureRequest(request({ sourceType: "text", content: "Forged", userId: userB }), context(repo))).status, 400);
  assert.equal((await handleCaptureRequest(request({ sourceType: "text", content: "Cross site" }, "https://outside.test"), context(repo))).status, 403);
  for (const error of [new AuthFailure("AUTH_REQUIRED"), new AuthFailure("AUTH_TIMEOUT")]) {
    const result = await handleCaptureRequest(request({ sourceType: "text", content: "Denied" }), async () => { throw error; });
    assert.equal(result.status, error.code === "AUTH_REQUIRED" ? 401 : 504);
  }
});

test("storage failures have no mock fallback and private sources are not logged", async () => {
  const repo = repository(); const original = repo.createUnique; repo.createUnique = async () => { throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); };
  const messages: unknown[][] = []; const originalError = console.error; console.error = (...args) => { messages.push(args); };
  try {
    const result = await handleCaptureRequest(request({ sourceType: "text", content: "do-not-log-private-content" }), context(repo));
    assert.equal(result.status, 503); assert.equal(messages.length, 0); assert.doesNotMatch(JSON.stringify(result), /do-not-log|database/i);
  } finally { console.error = originalError; repo.createUnique = original; }
});

test("capture production boundary has no mock store, unvetted fetch or AI provider", async () => {
  for (const file of ["src/lib/capture/service.ts", "src/lib/capture/server.ts", "src/app/api/capture/route.ts"]) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /tests\/support|in-memory|service.?role|gemini|nvidia|nebius|meta.?api/i);
  }
  const enrichment = await readFile(new URL("../src/lib/capture/enrichment.ts", import.meta.url), "utf8");
  assert.doesNotMatch(enrichment, /fetch\(link\.|fetch\(input\.|response\.text\(\)|redirect: "follow"/);
  // Generic pages are fetched only through the vetted helper: public DNS on every hop, manual redirects, size and type limits.
  assert.match(enrichment, /assertPublicHost\(current/); assert.match(enrichment, /redirect: "manual"/);
});

test("local migration defines owner-scoped atomic deduplication without applying providers", async () => {
  const sql = (await readFile(new URL("../supabase/migrations/20261027010000_capture_deduplication.sql", import.meta.url), "utf8")).toLowerCase();
  for (const fragment of ["dedupe_key", "unique index memories_owner_dedupe_key_idx", "(user_id, dedupe_key)", "where dedupe_key is not null", "grant insert (dedupe_key)"])
    assert.ok(sql.includes(fragment), fragment);
  assert.doesNotMatch(sql, /service_role|create extension|vector/i);
});
