import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { toModelEvidence } from "../src/lib/ai/meta/contracts.ts";
import { createSupadataMetadataFetcher, parseSupadataMetadata, supadataGate } from "../src/lib/capture/supadata.ts";
import { capture, enrichSavedLink, type LinkEnricher } from "../src/lib/capture/service.ts";
import { parsePublicLink } from "../src/lib/capture/url-policy.ts";
import { presentMemory } from "../src/lib/memory/presentation.ts";
import { rankMemories } from "../src/lib/retrieval/service.ts";
import { createInMemoryEnrichmentWriter, trackedRepository } from "./support/capture-flow.ts";
import { createMemoryTestState } from "./support/in-memory-memory-repository.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tiktokUrl = "https://www.tiktok.com/@cake.maker/video/7311223344556677889";
const instagramUrl = "https://www.instagram.com/reel/C1abcDEF/";
const env = { SUPADATA_DEV_ENABLED: "true", SUPADATA_API_KEY: "not-a-real-key-123456", SUPADATA_DEV_USER_ID: userA };
const primaryMissing: LinkEnricher = async () => ({ status: "partial", provider: "tiktok-oembed", reason: "provider-returned-no-title", provenance: {} });

function vendorRecord(url: string, platform: "tiktok" | "instagram", id: string, description = "Butterfly birthday cake decoration with purple icing #cakeidea") {
  return { platform, type: "video", id, url, title: null, description, author: { username: "cake.maker", displayName: "Cake Maker" },
    media: { type: "video", thumbnailUrl: "https://cdn.example.net/cover.jpg" }, tags: ["cakeidea", "birthday"], createdAt: "2026-10-28T10:00:00Z" };
}

test("Supadata is default-off and restricted to the one configured disposable development owner", () => {
  assert.equal(supadataGate(userA, env), true);
  assert.equal(supadataGate(userB, env), false);
  assert.equal(supadataGate(userA, { ...env, SUPADATA_DEV_ENABLED: "false" }), false);
  assert.equal(supadataGate(userA, { ...env, SUPADATA_API_KEY: undefined }), false);
});

test("TikTok and Instagram metadata becomes bounded unverified external detail, never a claimed caption", () => {
  const tikTok = parseSupadataMetadata(parsePublicLink(tiktokUrl), vendorRecord(tiktokUrl, "tiktok", "7311223344556677889"));
  assert.equal(tikTok.provider, "supadata-unverified"); assert.equal(tikTok.status, "complete"); assert.match(tikTok.title ?? "", /^Saved TikTok details:/);
  assert.equal(tikTok.provenance.caption, "supadata-unverified"); assert.deepEqual(tikTok.hashtags, ["cakeidea", "birthday"]);
  const instagram = parseSupadataMetadata(parsePublicLink(instagramUrl), vendorRecord(instagramUrl, "instagram", "C1abcDEF", "Weekend market flowers"));
  assert.equal(instagram.caption, "Weekend market flowers"); assert.equal(instagram.thumbnailUrl, "https://cdn.example.net/cover.jpg");
});

test("mismatched, malformed, null-field and unsafe-thumbnail vendor responses fail honestly", () => {
  const link = parsePublicLink(tiktokUrl);
  assert.equal(parseSupadataMetadata(link, vendorRecord(tiktokUrl, "instagram", "7311223344556677889")).reason, "supadata-mismatched-source");
  assert.equal(parseSupadataMetadata(link, { platform: "tiktok", id: "7311223344556677889", url: tiktokUrl, title: null, description: null, author: null, media: { thumbnailUrl: "javascript:alert(1)" }, tags: null }).status, "unavailable");
  assert.equal(parseSupadataMetadata(link, null).reason, "supadata-invalid-response");
});

test("the fixed server-side client sends only the canonical URL, has no retry, and maps provider failures safely", async () => {
  let calls = 0; let seen: URL | null = null;
  const fetcher = createSupadataMetadataFetcher({ env, fetch: async (input, init) => { calls++; seen = new URL(String(input));
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit"); assert.ok(!String(input).includes("rawText"));
    return new Response(JSON.stringify(vendorRecord(tiktokUrl, "tiktok", "7311223344556677889")), { headers: { "content-type": "application/json" } }); } });
  const result = await fetcher(parsePublicLink(tiktokUrl), userA);
  assert.equal(calls, 1); const requested = seen as URL | null; assert.ok(requested); assert.equal(requested.origin, "https://api.supadata.ai"); assert.equal(requested.pathname, "/v1/metadata"); assert.equal(result?.caption?.includes("Butterfly"), true);
  const denied = await fetcher(parsePublicLink(tiktokUrl), userB); assert.equal(denied, null); assert.equal(calls, 1);
  for (const [status, reason] of [[403, "supadata-forbidden"], [404, "supadata-not-found"], [429, "supadata-rate-limited"]] as const) {
    const failed = createSupadataMetadataFetcher({ env, fetch: async () => { calls++; return new Response("", { status, headers: { "content-type": "application/json" } }); } });
    assert.equal((await failed(parsePublicLink(tiktokUrl), userA))?.reason, reason);
  }
  assert.equal(calls, 4, "each failure makes one call; there is no automatic retry");
  const timedOut = createSupadataMetadataFetcher({ env, timeoutMs: 5, fetch: async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }) });
  assert.equal((await timedOut(parsePublicLink(tiktokUrl), userA))?.reason, "supadata-timeout");
});

test("one owned saved Memory receives external details, remains searchable and never spends again on an ordinary re-share", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const saved = await capture({ sourceType: "link", content: tiktokUrl, title: "My chosen label", note: "My own note" }, repo);
  let calls = 0;
  const fallback = async () => { calls++; return parseSupadataMetadata(parsePublicLink(tiktokUrl), vendorRecord(tiktokUrl, "tiktok", "7311223344556677889")); };
  const first = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  assert.equal(first.memory.id, saved.memory.id); assert.equal(first.memory.title, "My chosen label"); assert.equal(first.memory.rawText, "My own note"); assert.equal(first.memory.metadata.metadataProvider, "supadata-unverified"); assert.equal(first.memory.metadata.caption, "Butterfly birthday cake decoration with purple icing #cakeidea");
  assert.equal(rankMemories(await repo.searchCandidates(20), "butterfly purple cake decoration", 5).items[0]?.memoryId, saved.memory.id);
  const view = presentMemory(first.memory); assert.equal(view.summary?.from, "Retrieved description via Supadata (origin not verified)"); assert.match(view.knows[0]?.heading ?? "", /origin not verified/i);
  const evidence = toModelEvidence(rankMemories(await repo.searchCandidates(20), "butterfly cake", 1).items)[0];
  assert.equal(evidence.link_details?.provider_caption_origin, "supadata-unverified"); assert.equal(evidence.stored_note_excerpt, null);
  const again = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  assert.equal(calls, 1); assert.equal(again.memory.id, saved.memory.id); assert.equal(state.size, 1);
});

test("a safely resolved TikTok short link sends its canonical post to Supadata and still deduplicates with the full URL", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const full = await capture({ sourceType: "link", content: tiktokUrl }, repo);
  const short = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMabc123/" }, repo);
  const resolved = parsePublicLink(tiktokUrl); let received = "";
  const primary: LinkEnricher = async () => ({ status: "partial", provider: "tiktok-oembed", reason: "provider-returned-no-title", resolved, provenance: {} });
  const merged = await enrichSavedLink(short.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primary, 1_000, async link => {
    received = link.normalized; return parseSupadataMetadata(link, vendorRecord(tiktokUrl, "tiktok", "7311223344556677889"));
  });
  assert.equal(received, tiktokUrl); assert.equal(merged.memory.id, full.memory.id); assert.equal(state.size, 1);
});

test("concurrent detail refreshes share one optional provider request for the same owned Memory", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state); const saved = await capture({ sourceType: "link", content: tiktokUrl }, repo);
  let calls = 0; let resolve!: (value: ReturnType<typeof parseSupadataMetadata>) => void;
  const pending = new Promise<ReturnType<typeof parseSupadataMetadata>>(done => { resolve = done; });
  const fallback = async () => { calls++; return pending; };
  const first = enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  const second = enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primaryMissing, 1_000, fallback);
  resolve(parseSupadataMetadata(parsePublicLink(tiktokUrl), vendorRecord(tiktokUrl, "tiktok", "7311223344556677889")));
  await Promise.all([first, second]); assert.equal(calls, 1);
});

test("existing useful YouTube metadata is never sent to the optional provider", async () => {
  const state = createMemoryTestState(); const repo = trackedRepository(userA, state);
  const saved = await capture({ sourceType: "link", content: "https://www.youtube.com/watch?v=rfscVS0vtbw" }, repo);
  let fallbackCalls = 0;
  const primary: LinkEnricher = async () => ({ status: "complete", provider: "youtube-oembed", title: "Existing YouTube title", thumbnailUrl: "https://i.ytimg.com/vi/x/hq.jpg", provenance: { title: "youtube-oembed", thumbnailUrl: "youtube-oembed" } });
  const enriched = await enrichSavedLink(saved.memory.id, repo, createInMemoryEnrichmentWriter(userA, state), primary, 1_000, async () => { fallbackCalls++; return null; });
  assert.equal(fallbackCalls, 0); assert.equal(enriched.memory.title, "Existing YouTube title"); assert.equal(enriched.memory.metadata.metadataProvider, "youtube-oembed");
});

test("consumer UI names Supadata as unverified external details and never calls it a caption from the creator", async () => {
  const source = await readFile("src/components/capture/source-details.tsx", "utf8"); const presentation = await readFile("src/lib/memory/presentation.ts", "utf8");
  assert.match(source, /origin has not been verified/); assert.match(presentation, /Retrieved description via Supadata \(origin not verified\)/);
  assert.doesNotMatch(source, /official caption/i);
});

test("prepared migration keeps trusted enrichment service-role-only while extending only the provenance allowlist", async () => {
  const migration = await readFile("supabase/migrations/20261102000000_supadata_unverified_metadata.sql", "utf8");
  assert.match(migration, /'supadata-unverified'/); assert.match(migration, /security definer set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.apply_trusted_link_enrichment[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.apply_trusted_link_enrichment[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/i);
});
