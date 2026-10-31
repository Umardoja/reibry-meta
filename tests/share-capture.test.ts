// Stage 12J-1: iPhone Shortcut / share-sheet handoff and TikTok short/full-link identity. No network: TikTok redirects and oEmbed are mocked.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { enrichLink, type MetadataFetch, type MetadataResult } from "../src/lib/capture/enrichment.ts";
import { capture, enrichSavedLink } from "../src/lib/capture/service.ts";
import { parseSharedFragment, parseSharedPayload, SHARED_URL_MAX } from "../src/lib/capture/share.ts";
import type { Memory } from "../src/lib/memory/contracts.ts";
import { createMemoryTestState, type MemoryTestState } from "./support/in-memory-memory-repository.ts";
import { createInMemoryEnrichmentWriter, trackedRepository } from "./support/capture-flow.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const publicDns = async () => [{ address: "8.8.8.8" }];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const redirect = (location: string, status = 301) => new Response(null, { status, headers: { location } });
const full = (id: string, user = "baker.jo") => `https://www.tiktok.com/@${user}/video/${id}`;
const POST = "7311223344556677889"; const OTHER = "7399887766554433221";
const from = (values: Record<string, string>) => (name: "url" | "text" | "title") => values[name] ?? null;

test("share handoff: HTTPS links only, link found inside shared text, bounded sizes, and no identity or other fields carried", () => {
  assert.deepEqual(parseSharedPayload(from({ url: full(POST), title: "  Pink   cake  " })), { url: full(POST), title: "Pink cake", note: "" });
  const tiktokText = `Check out this video! https://vm.tiktok.com/ZMabc123/ #cake`;
  assert.deepEqual(parseSharedPayload(from({ text: tiktokText })), { url: "https://vm.tiktok.com/ZMabc123/", title: "", note: "Check out this video! #cake" });
  for (const bad of ["http://www.tiktok.com/@a/video/1", "javascript:alert(1)", "data:text/html,<script>", "https://user:pass@evil.example/x", "https://localhost/x",
    "ftp://example.com/x", " ", `https://example.com/${"a".repeat(SHARED_URL_MAX)}`])
    assert.equal(parseSharedPayload(from({ url: bad })), null, bad);
  assert.equal(parseSharedPayload(from({ text: "no link here, only words" })), null);
  // Only url/text/title are read: an injected identity or redirect parameter has no effect.
  const parsed = parseSharedPayload(name => ({ url: full(POST), userId: userB, next: "https://evil.example", email: "x@example.com" } as Record<string, string>)[name] ?? null);
  assert.deepEqual(Object.keys(parsed ?? {}).sort(), ["note", "title", "url"]);
});
test("fragment handoff (#url=...) decodes safely and rejects anything that is not an HTTPS link", () => {
  assert.equal(parseSharedFragment(`#url=${encodeURIComponent(`${full(POST)}?is_from_webapp=1&_t=x`)}`)?.url, `${full(POST)}?is_from_webapp=1&_t=x`);
  assert.equal(parseSharedFragment(`#text=${encodeURIComponent("Look https://vt.tiktok.com/ZSxyz789/ now")}`)?.url, "https://vt.tiktok.com/ZSxyz789/");
  for (const bad of ["", "#", "#url=javascript%3Aalert(1)", "#url=%E0%A4%A", `#url=${"x".repeat(9_000)}`, "#url=https%3A%2F%2Fintranet%2Fsecret"]) assert.equal(parseSharedFragment(bad), null, bad);
});
test("Capture page: prefill only, no referrer, link stripped from the address bar, signed-out handoff kept in this tab", async () => {
  const page = await readFile("src/app/capture/page.tsx", "utf8"); const handoff = await readFile("src/components/capture/share-handoff.tsx", "utf8");
  const form = await readFile("src/components/capture/capture-form.tsx", "utf8");
  assert.match(page, /referrer: "no-referrer"/); assert.doesNotMatch(page, /capture\(|fetch\(/, "visiting the page never saves");
  assert.match(handoff, /parseSharedFragment\(window\.location\.hash\)/); assert.match(handoff, /storePendingShare\(payload\)/);
  assert.match(handoff, /replaceState\(null, "", "\/capture"\)/); assert.match(handoff, /router\.replace\("\/auth\?next=\/capture"\)/);
  // The form reads the #fragment (readShareArrival -> parseSharedFragment) and strips it, keeping Next's own history state.
  assert.match(form, /readShareArrival\(window\.location\.search, window\.location\.hash\)/); assert.match(form, /replaceState\(window\.history\.state, "", "\/capture"\)/);
  assert.match(form, /addEventListener\("hashchange"/, "a share into an already-open tab (fragment-only change) is still read");
  assert.match(form, /if \(inFlight\.current\) return; inFlight\.current = true/, "a double click cannot submit twice");
});

/** Mock TikTok: share codes redirect to a post; oEmbed returns the iframe-only shape TikTok currently sends. */
function tiktokNetwork(codes: Record<string, string | number>, calls: string[] = []): MetadataFetch {
  return async input => {
    const url = new URL(input.toString()); calls.push(url.hostname);
    if (url.hostname === "vm.tiktok.com" || url.hostname === "vt.tiktok.com") {
      const target = codes[url.pathname.split("/").filter(Boolean)[0]]; if (target === undefined || typeof target === "number") return new Response(null, { status: typeof target === "number" ? target : 404 });
      return redirect(`${target}?is_from_webapp=1&sender_device=pc&web_id=123`);
    }
    if (url.pathname === "/oembed") return json({ version: "1.0", type: "video", html: "<iframe></iframe>", provider_name: "TikTok" });
    return new Response(null, { status: 404 });
  };
}
function world(owner = userA, state: MemoryTestState = createMemoryTestState()) {
  const repository = trackedRepository(owner, state); const writer = createInMemoryEnrichmentWriter(owner, state);
  const enrich = (codes: Record<string, string | number>, calls?: string[]) => (link: Parameters<typeof enrichLink>[0]) => enrichLink(link, { resolve: publicDns, fetcher: tiktokNetwork(codes, calls) });
  return { state, repository, writer, enrich };
}
const tiktokMemories = (state: MemoryTestState, owner = userA) => [...state.values()].filter((memory: Memory) => memory.userId === owner && memory.metadata.platform === "tiktok");

test("full link first, then a vm. share link to the SAME post: one Memory, the earlier one is kept and gains the new note", async () => {
  const w = world();
  const original = await capture({ sourceType: "link", content: full(POST) }, w.repository);
  const shared = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMabc123/", note: "pink cake for mum" }, w.repository);
  assert.notEqual(shared.memory.id, original.memory.id, "save-first cannot know the post yet");
  const enriched = await enrichSavedLink(shared.memory.id, w.repository, w.writer, w.enrich({ ZMabc123: full(POST) }));
  assert.ok("mergedDuplicate" in enriched); assert.equal(enriched.memory.id, original.memory.id); assert.equal(enriched.memory.rawText, "pink cake for mum");
  assert.equal(enriched.memory.metadata.postId, POST); assert.equal(enriched.memory.sourceUrl, full(POST));
  assert.deepEqual(tiktokMemories(w.state).map(memory => memory.id), [original.memory.id]);
});
test("share link first (post verified by enrichment), then the full link: the save returns the same Memory without contacting TikTok", async () => {
  const w = world(); const calls: string[] = [];
  const shared = await capture({ sourceType: "link", content: "https://vt.tiktok.com/ZSxyz789/" }, w.repository);
  await enrichSavedLink(shared.memory.id, w.repository, w.writer, w.enrich({ ZSxyz789: full(POST) }, calls));
  const before = calls.length;
  const again = await capture({ sourceType: "link", content: `${full(POST)}?is_from_webapp=1&_r=1&_t=abc`, note: "save for later" }, w.repository);
  assert.equal(again.duplicate, true); assert.equal(again.memory.id, shared.memory.id); assert.equal(again.memory.rawText, "save for later");
  assert.equal(calls.length, before, "the save made no network call"); assert.equal(tiktokMemories(w.state).length, 1);
});
test("two different share codes for the same post become one Memory; a different post ID never merges", async () => {
  const w = world();
  const first = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMaaa111/" }, w.repository);
  await enrichSavedLink(first.memory.id, w.repository, w.writer, w.enrich({ ZMaaa111: full(POST) }));
  const second = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMbbb222/" }, w.repository);
  const merged = await enrichSavedLink(second.memory.id, w.repository, w.writer, w.enrich({ ZMbbb222: full(POST) }));
  assert.equal(merged.memory.id, first.memory.id); assert.equal(tiktokMemories(w.state).length, 1);
  const different = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMccc333/" }, w.repository);
  const kept = await enrichSavedLink(different.memory.id, w.repository, w.writer, w.enrich({ ZMccc333: full(OTHER, "other.user") }));
  assert.ok(!("mergedDuplicate" in kept)); assert.equal(kept.memory.id, different.memory.id); assert.equal(kept.memory.metadata.postId, OTHER);
  assert.equal(tiktokMemories(w.state).length, 2, "different videos stay separate");
  const fullOther = await capture({ sourceType: "link", content: full(OTHER, "other.user") }, w.repository);
  assert.equal(fullOther.memory.id, different.memory.id); assert.notEqual(fullOther.memory.id, first.memory.id);
});
test("when the share link cannot be resolved (404, blocked, unsafe redirect, timeout) nothing merges and the saved link is kept", async () => {
  const w = world(); const original = await capture({ sourceType: "link", content: full(POST) }, w.repository);
  for (const [code, outcome] of [["ZMgone404", 404], ["ZMblock403", 403]] as const) {
    const saved = await capture({ sourceType: "link", content: `https://vm.tiktok.com/${code}/` }, w.repository);
    const result = await enrichSavedLink(saved.memory.id, w.repository, w.writer, w.enrich({ [code]: outcome }));
    assert.ok(!("mergedDuplicate" in result)); assert.equal(result.memory.id, saved.memory.id); assert.equal(result.memory.sourceUrl, `https://vm.tiktok.com/${code}/`);
    assert.equal(result.enrichment.status, "unavailable"); assert.equal(result.memory.metadata.postId, undefined, "no guessed post ID");
  }
  const evil = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMevil999/" }, w.repository);
  const refused = await enrichSavedLink(evil.memory.id, w.repository, w.writer, link => enrichLink(link, { resolve: publicDns,
    fetcher: async () => redirect(`https://evil.example/@baker.jo/video/${POST}`) }));
  assert.equal(refused.enrichment.reason, "unsafe-destination"); assert.ok(!("mergedDuplicate" in refused));
  const slow = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMslow000/" }, w.repository);
  const timedOut = await enrichSavedLink(slow.memory.id, w.repository, w.writer, () => new Promise<MetadataResult>(() => {}), 50);
  assert.equal(timedOut.enrichment.status, "timed-out"); assert.equal(timedOut.memory.id, slow.memory.id);
  assert.equal(tiktokMemories(w.state).length, 5, "every unresolved share stays saved"); assert.ok(tiktokMemories(w.state).some(memory => memory.id === original.memory.id));
});
test("the older Memory is kept even when the newer one is the full link; tracking parameters are never identity", async () => {
  const state = createMemoryTestState(); let clock = 0; const times = ["2026-10-29T10:00:00.000Z", "2026-10-30T10:00:00.000Z"];
  const { createInMemoryMemoryRepository } = await import("./support/in-memory-memory-repository.ts");
  const repository = createInMemoryMemoryRepository(userA, state, { now: () => times[Math.min(clock++, 1)] }); const writer = createInMemoryEnrichmentWriter(userA, state);
  const shared = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMold111/", title: "Mum's cake" }, repository);
  const fullLink = await capture({ sourceType: "link", content: `${full(POST)}?_t=one`, note: "from the full link" }, repository);
  assert.notEqual(fullLink.memory.id, shared.memory.id, "the share link was not resolved yet");
  const merged = await enrichSavedLink(shared.memory.id, repository, writer, link => enrichLink(link, { resolve: publicDns, fetcher: tiktokNetwork({ ZMold111: full(POST) }) }));
  assert.equal(merged.memory.id, shared.memory.id, "the earlier (share-link) Memory survives"); assert.equal(merged.memory.title, "Mum's cake");
  assert.equal(merged.memory.rawText, "from the full link"); assert.equal(state.has(fullLink.memory.id), false);
  assert.equal((await capture({ sourceType: "link", content: `${full(POST)}?_t=two&sender_device=pc` }, repository)).memory.id, shared.memory.id);
});
test("cross-user: the same TikTok post saved by another user is never merged or returned", async () => {
  const state = createMemoryTestState(); const a = world(userA, state); const b = world(userB, state);
  const mine = await capture({ sourceType: "link", content: full(POST) }, a.repository);
  const theirs = await capture({ sourceType: "link", content: "https://vm.tiktok.com/ZMbbb222/" }, b.repository);
  const enriched = await enrichSavedLink(theirs.memory.id, b.repository, b.writer, b.enrich({ ZMbbb222: full(POST) }));
  assert.ok(!("mergedDuplicate" in enriched)); assert.equal(enriched.memory.userId, userB); assert.ok(state.has(mine.memory.id));
  const theirFull = await capture({ sourceType: "link", content: full(POST) }, b.repository);
  assert.equal(theirFull.memory.id, theirs.memory.id); assert.notEqual(theirFull.memory.id, mine.memory.id);
});
test("details endpoint reports a merge as a boolean only, never the removed Memory's identifier (offline source check)", async () => {
  const handler = await readFile("src/lib/capture/handler.ts", "utf8");
  assert.match(handler, /data: { memory: result.memory, enrichment: result.enrichment, merged: "mergedDuplicate" in result }/);
  assert.doesNotMatch(handler, /removedId/);
});
