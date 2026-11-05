// Stage 12I: save-first social link capture, bounded enrichment, canonical deduplication, SSRF and searchability. No network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { toModelEvidence } from "../src/lib/ai/meta/contracts.ts";
import { enrichLink, fetchVettedPage, parsePageMetadata, resolveTikTokShareLink, type MetadataFetch, type MetadataResult } from "../src/lib/capture/enrichment.ts";
import { handleCaptureDetailsRequest } from "../src/lib/capture/handler.ts";
import { capture, enrichSavedLink } from "../src/lib/capture/service.ts";
import { parsePublicLink } from "../src/lib/capture/url-policy.ts";
import { rankMemories } from "../src/lib/retrieval/service.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";
import { createInMemoryEnrichmentWriter, saveAndEnrich, trackedRepository } from "./support/capture-flow.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const publicDns = async () => [{ address: "8.8.8.8" }];
const repository = (owner = userA, state = createMemoryTestState()) => trackedRepository(owner, state);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const redirect = (location: string) => new Response(null, { status: 301, headers: { location } });
const tiktok = "https://www.tiktok.com/@baker.jo/video/7311223344556677889";

test("save is request 1 and contacts no provider; a hanging provider in request 2 is bounded and the link stays saved", async () => {
  const repo = repository(); const started = Date.now();
  const saved = await capture({ sourceType: "link", content: tiktok }, repo);
  assert.ok(Date.now() - started < 200); assert.equal(saved.enrichment.status, "pending"); assert.equal(saved.memory.metadata.enrichment, "pending");
  assert.equal(saved.memory.title, "TikTok video by @baker.jo"); assert.equal((saved.memory.metadata.provenance as Record<string, string>).title, "reibry-placeholder");
  const enriched = await saveAndEnrich({ sourceType: "link", content: tiktok }, repo, () => new Promise<MetadataResult>(() => {}), 50);
  assert.equal(enriched.duplicate, true); assert.equal(enriched.enrichment.status, "timed-out"); assert.equal(enriched.memory.metadata.enrichment, "timed-out");
  assert.equal(enriched.memory.sourceUrl, tiktok); assert.equal(enriched.memory.id, saved.memory.id);
});
test("provider timeouts are bounded and reported as provider-timeout", async () => {
  const hanging: MetadataFetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  const result = await enrichLink(parsePublicLink("https://example.com/slow"), { resolve: publicDns, fetcher: hanging, timeoutMs: 20 });
  assert.equal(result.status, "unavailable"); assert.equal(result.reason, "provider-timeout");
});
test("URL normalization collapses share variants to one content identity and strips tracking", () => {
  for (const url of ["https://www.youtube.com/watch?v=rfscVS0vtbw", "https://youtu.be/rfscVS0vtbw?si=abc123", "https://m.youtube.com/watch?v=rfscVS0vtbw&feature=share", "https://www.youtube.com/embed/rfscVS0vtbw"])
    assert.equal(parsePublicLink(url).identity, "youtube:rfscVS0vtbw", url);
  const short = parsePublicLink("https://www.youtube.com/shorts/AbCdEf12345?feature=share"); assert.equal(short.format, "short"); assert.equal(short.normalized, "https://www.youtube.com/watch?v=AbCdEf12345");
  const tt = parsePublicLink(`${tiktok}?is_from_webapp=1&sender_device=pc&_r=1&_t=8xyz`); assert.equal(tt.identity, "tiktok:7311223344556677889"); assert.equal(tt.normalized, tiktok); assert.equal(tt.creatorHandle, "@baker.jo");
  for (const url of ["https://www.instagram.com/reel/C1abcDEF/?igsh=xyz", "https://instagram.com/reels/C1abcDEF/", "https://www.instagram.com/reel/C1abcDEF"]) assert.equal(parsePublicLink(url).identity, "instagram:C1abcDEF", url);
  assert.equal(parsePublicLink("https://Example.com/a?id=7&utm_medium=social&fbclid=1#x").normalized, "https://example.com/a?id=7");
});
test("TikTok share links resolve through at most 3 vetted redirects to the canonical post", async () => {
  const link = parsePublicLink("https://vm.tiktok.com/ZMabc123/"); assert.equal(link.shortLink, true);
  const hops: string[] = []; const resolved = await resolveTikTokShareLink(link, { resolve: publicDns, fetcher: async input => { hops.push(new URL(input.toString()).hostname);
    return redirect(`${tiktok}?_r=1&_t=share`); } });
  assert.equal(resolved.identity, "tiktok:7311223344556677889"); assert.deepEqual(hops, ["vm.tiktok.com"]); assert.equal(resolved.submitted, "https://vm.tiktok.com/ZMabc123/");
  await assert.rejects(resolveTikTokShareLink(link, { resolve: publicDns, fetcher: async () => redirect("https://evil.example/@x/video/1234567") }), /unsafe-redirect/);
  await assert.rejects(resolveTikTokShareLink(link, { resolve: async () => [{ address: "10.0.0.5" }], fetcher: async () => redirect(tiktok) }), /unsafe-address/);
  await assert.rejects(resolveTikTokShareLink(link, { resolve: publicDns, fetcher: async () => redirect("https://vm.tiktok.com/ZMabc123/") }), /short-link-unresolved/);
});
test("repeated shares (tracking variants and resolved share links) return the existing owned Memory", async () => {
  const repo = repository(); const offline = async (): Promise<MetadataResult> => ({ status: "unavailable", provider: null, reason: "provider-error", provenance: {} });
  const first = await saveAndEnrich({ sourceType: "link", content: tiktok }, repo, offline);
  const tracked = await saveAndEnrich({ sourceType: "link", content: `${tiktok}?is_from_webapp=1&_t=abc` }, repo, offline);
  // A share link cannot be resolved without network, so save-first keys it by its own identity. Enrichment resolves it to the post; the
  // same verified post ID as the earlier full link means one Memory (Stage 12J-1): the earlier Memory is kept and returned.
  const share = (n: number) => saveAndEnrich({ sourceType: "link", content: "https://vm.tiktok.com/ZMabc123/" }, repo, link => enrichLink(link, { resolve: publicDns,
    fetcher: async input => new URL(input.toString()).hostname === "vm.tiktok.com" ? redirect(`${tiktok}?n=${n}`) : json({ html: "<iframe></iframe>" }) }));
  const viaShare = await share(1); const viaShareAgain = await share(2);
  assert.equal(tracked.duplicate, true); assert.equal(tracked.memory.id, first.memory.id);
  assert.equal(viaShare.memory.id, first.memory.id); assert.equal(viaShareAgain.memory.id, first.memory.id);
  assert.equal(viaShare.memory.metadata.canonicalUrl, tiktok); assert.equal(viaShare.memory.metadata.postId, "7311223344556677889");
  assert.equal((await repo.searchCandidates(50)).filter(memory => memory.metadata.platform === "tiktok").length, 1, "one Memory for one TikTok post");
  const yt = await saveAndEnrich({ sourceType: "link", content: "https://www.youtube.com/watch?v=rfscVS0vtbw" }, repo, offline);
  assert.equal((await saveAndEnrich({ sourceType: "link", content: "https://youtu.be/rfscVS0vtbw?si=share" }, repo, offline)).memory.id, yt.memory.id);
});
test("TikTok iframe-only oEmbed: post confirmed, creator from URL, no invented title, caption or cover", async () => {
  const result = await saveAndEnrich({ sourceType: "link", content: tiktok }, repository(), link => enrichLink(link, { resolve: publicDns,
    fetcher: async () => json({ version: "1.0", type: "video", html: "<iframe src=\"https://www.tiktok.com/player/v1/7311223344556677889\"></iframe>", provider_name: "TikTok" }) }));
  assert.equal(result.enrichment.status, "partial"); assert.equal(result.enrichment.reason, "provider-returned-no-title");
  assert.equal(result.memory.title, "TikTok video by @baker.jo"); assert.equal(result.memory.metadata.author, "@baker.jo");
  const provenance = result.memory.metadata.provenance as Record<string, string>; assert.equal(provenance.author, "url"); assert.equal(provenance.title, "reibry-placeholder");
  for (const field of ["caption", "thumbnailUrl"]) assert.equal(field in result.memory.metadata, false, field);
});
test("blocked, private or deleted posts keep the saved link with an honest reason", async () => {
  const deleted = await saveAndEnrich({ sourceType: "link", content: tiktok }, repository(), link => enrichLink(link, { resolve: publicDns, fetcher: async () => json({ code: 10204, message: "not found" }, 404) }));
  assert.equal(deleted.enrichment.reason, "not-found-or-private"); assert.equal(deleted.memory.sourceUrl, tiktok);
  const blocked = await enrichLink(parsePublicLink("https://example.com/post"), { resolve: publicDns, fetcher: async () => html("denied", 403) });
  assert.equal(blocked.reason, "provider-blocked");
  let calls = 0; const insta = await enrichLink(parsePublicLink("https://www.instagram.com/p/C1abcDEF/"), { resolve: publicDns, fetcher: async () => { calls++; return html(""); } });
  assert.equal(insta.reason, "instagram-requires-meta-app-token"); assert.equal(calls, 0, "Instagram is never scraped");
});
test("untrusted page metadata is cleaned: no markup, scripts, unsafe image URLs or login-wall titles", async () => {
  const page = `<html><head><title>Instagram</title><meta property="og:title" content="Pink &amp; gold &lt;b&gt;birthday&lt;/b&gt; cake &#x1F382;">
    <meta property="og:description" content="Buttercream ombre. #pinkcake #birthday <script>alert(1)</script>\u0007">
    <meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="http://insecure.example/x.jpg">
    <script type="application/ld+json">{"@type":"VideoObject","uploadDate":"2026-09-01T10:00:00Z","duration":"PT1M30S","author":{"name":"Cake Studio"},"thumbnailUrl":"https://127.0.0.1/a.jpg"}</script></head></html>`;
  const found = parsePageMetadata(page, "https://example.com/cake");
  assert.equal(found.title, "Pink & gold birthday cake 🎂"); assert.doesNotMatch(found.caption ?? "", /<|script|\u0007/); assert.deepEqual(found.hashtags, ["pinkcake", "birthday"]);
  assert.equal(found.thumbnailUrl, undefined); assert.equal(found.author, "Cake Studio"); assert.equal(found.durationSeconds, 90); assert.equal(found.publishedAt, "2026-09-01T10:00:00.000Z");
  assert.equal(parsePageMetadata("<title>Login • Instagram</title>", "https://www.instagram.com/").title, undefined);
});
test("SSRF: page redirects to private, metadata or non-HTTPS targets and non-HTML content are refused", async () => {
  const link = parsePublicLink("https://example.com/start");
  for (const target of ["http://example.com/plain", "https://169.254.169.254/latest/meta-data", "https://localhost/x"]) {
    const result = await enrichLink(link, { resolve: publicDns, fetcher: async () => redirect(target) }); assert.equal(result.reason, "unsafe-destination", target);
  }
  let second = 0; const rebind = await enrichLink(link, { resolve: async host => host === "example.com" ? [{ address: "8.8.8.8" }] : [{ address: "10.1.2.3" }],
    fetcher: async () => { second++; return redirect("https://internal.example.org/admin"); } });
  assert.equal(rebind.reason, "unsafe-destination"); assert.equal(second, 1, "the private second hop is never requested");
  const binary = await enrichLink(link, { resolve: publicDns, fetcher: async () => new Response("x", { headers: { "content-type": "application/octet-stream" } }) });
  assert.equal(binary.reason, "not-a-web-page");
  let hops = 0; const loop = await fetchVettedPage(new URL("https://example.com/a"), { resolve: publicDns, fetcher: async () => { hops++; return redirect(`https://example.com/a${hops}`); } }).catch(error => error.message);
  assert.equal(loop, "too-many-redirects"); assert.equal(hops, 4);
});
test("cross-user isolation: another user's Memory cannot be refreshed, and the same link is a separate Memory per owner", async () => {
  const state = createMemoryTestState(); const a = repository(userA, state); const b = repository(userB, state);
  const offline = async (): Promise<MetadataResult> => ({ status: "unavailable", provider: null, provenance: {} });
  const owned = await saveAndEnrich({ sourceType: "link", content: tiktok }, a, offline);
  const request = new Request(`http://localhost:3000/api/capture/${owned.memory.id}/details`, { method: "POST", headers: { Origin: "http://localhost:3000" } });
  const denied = await handleCaptureDetailsRequest(request, owned.memory.id, async () => ({ userId: userB, repository: b, enrichmentWriter: createInMemoryEnrichmentWriter(userB, state) }), "http://localhost:3000");
  assert.equal(denied.status, 404); assert.equal(denied.data, null);
  // Even if a forged call reached the writer, it re-checks ownership (mirrors the database function).
  await assert.rejects(createInMemoryEnrichmentWriter(userB, state)(owned.memory.id, { enrichment: "complete" }, "Forged"), /not found/i);
  assert.notEqual((await saveAndEnrich({ sourceType: "link", content: tiktok }, b, offline)).memory.id, owned.memory.id);
});
test("captured caption, creator, hashtags and the user's note are searchable; filler-only queries match nothing", async () => {
  const repo = repository();
  await saveAndEnrich({ sourceType: "link", content: "https://example.com/cakes/pink-ombre", note: "For Mum's 60th" }, repo, async () => ({ status: "complete", provider: "page-metadata",
    title: "Ombre layer cake", caption: "Pink buttercream ombre cake design with gold leaf. #pinkcake", author: "Cake Studio", hashtags: ["pinkcake"], provenance: { title: "page-metadata", caption: "page-metadata", author: "page-metadata" } }));
  await saveAndEnrich({ sourceType: "link", content: "https://www.youtube.com/watch?v=rfscVS0vtbw" }, repo, async () => ({ status: "complete", provider: "youtube-oembed",
    title: "Learn Python - Full Course for Beginners", author: "freeCodeCamp.org", provenance: { title: "youtube-oembed", author: "youtube-oembed" } }));
  const memories = await repo.searchCandidates(250);
  assert.equal(rankMemories(memories, "That pink cake design I saved", 5).items[0]?.displayTitle, "Ombre layer cake");
  assert.equal(rankMemories(memories, "the cake for mum", 5).items[0]?.displayTitle, "Ombre layer cake", "the user's own note is searchable");
  assert.equal(rankMemories(memories, "Python tutorial I saved", 5).items[0]?.displayTitle, "Learn Python - Full Course for Beginners");
  assert.equal(rankMemories(memories, "freecodecamp", 5).items.length, 1);
  assert.equal(rankMemories(memories, "that thing I saved", 5).state, "no-match");
  const [evidence] = toModelEvidence(rankMemories(memories, "pink cake", 1).items);
  assert.equal(evidence.link_details?.provider_caption, "Pink buttercream ombre cake design with gold leaf. #pinkcake"); assert.equal(evidence.link_details?.user_note, "For Mum's 60th");
  assert.equal(evidence.stored_note_excerpt, null, "a link's caption is never presented as a stored note or transcript");
});
test("enrichment persists provider metadata, replaces only a placeholder title and never overrides the user's title or note", async () => {
  const repo = repository(); const state = createMemoryTestState(); void state; const offline = async (): Promise<MetadataResult> => ({ status: "unavailable", provider: null, provenance: {} });
  const ok = async (): Promise<MetadataResult> => ({ status: "complete", provider: "youtube-oembed", title: "Real title", author: "Channel", thumbnailUrl: "https://i.ytimg.com/vi/x/hq.jpg", provenance: { title: "youtube-oembed", author: "youtube-oembed", thumbnailUrl: "youtube-oembed" } });
  const placeholder = await saveAndEnrich({ sourceType: "link", content: "https://youtu.be/rfscVS0vtbw" }, repo, offline); assert.equal(placeholder.memory.title, "YouTube video");
  const retried = await saveAndEnrich({ sourceType: "link", content: "https://youtu.be/rfscVS0vtbw" }, repo, ok);
  assert.equal(retried.memory.title, "Real title"); assert.equal(retried.memory.metadata.author, "Channel"); assert.equal(retried.memory.metadata.thumbnailUrl, "https://i.ytimg.com/vi/x/hq.jpg");
  assert.equal((await repo.read(placeholder.memory.id)).metadata.enrichment, "complete", "metadata is persisted, not just returned");
  const named = await saveAndEnrich({ sourceType: "link", content: "https://example.com/mine", title: "My own name" }, repo, ok);
  assert.equal(named.memory.title, "My own name"); assert.equal((named.memory.metadata.provenance as Record<string, string>).title, "user"); assert.equal(named.memory.metadata.author, "Channel");
  const noted = await saveAndEnrich({ sourceType: "link", content: "https://example.com/noted", note: "my words" }, repo, ok);
  assert.equal(noted.memory.rawText, "my words"); assert.equal((noted.memory.metadata.provenance as Record<string, string>).note, "user");
});
test("capture UI: single submission, honest save/detail states, and one-shot signed-in Shortcut auto-save", async () => {
  const form = await readFile("src/components/capture/capture-form.tsx", "utf8"); const handoff = await readFile("src/components/capture/share-handoff.tsx", "utf8");
  const page = await readFile("src/app/capture/page.tsx", "utf8"); const details = await readFile("src/components/capture/source-details.tsx", "utf8");
  for (const text of ["if (inFlight.current) return", "Saving…", "Retry saving", "Details ready", "Limited details", "Getting details…", "Already saved", "void getDetails(saved)", "if (detailsInFlight.current) return", "const initialHash = window.location.hash", "setShortcutAutoSave(token)", "window.setTimeout(() => { void saveCapture(detected, \"\", sharedWithLink); }, 0)", "autoSaveHandled.current === shortcutAutoSave"]) assert.ok(form.includes(text), text);
  assert.doesNotMatch(handoff, /fetch\(/, "a signed-out share is never saved automatically"); assert.match(page, /supported video links save automatically/i);
  for (const text of ["Open original", "No description is available from this source.", "Additional details are shown here.", "referrerPolicy=\"no-referrer\""]) assert.ok(details.includes(text), text);
  assert.doesNotMatch(details, /dangerouslySetInnerHTML/);
});
test("live 12I defects: a repeated share fills a missing note and upgrades a placeholder title, never overwriting the user's words", async () => {
  const repo = repository(); const offline = async (): Promise<MetadataResult> => ({ status: "unavailable", provider: null, provenance: {} });
  const titled = async (): Promise<MetadataResult> => ({ status: "complete", provider: "page-metadata", title: "Birthday cake", provenance: { title: "page-metadata" } });
  const first = await saveAndEnrich({ sourceType: "link", content: "https://en.wikipedia.org/wiki/Birthday_cake" }, repo, offline); assert.equal(first.memory.title, "en.wikipedia.org");
  const again = await saveAndEnrich({ sourceType: "link", content: "https://en.wikipedia.org/wiki/Birthday_cake", note: "Ideas for Mum" }, repo, titled);
  assert.equal(again.duplicate, true); assert.equal(again.memory.id, first.memory.id); assert.equal(again.memory.title, "Birthday cake"); assert.equal(again.memory.rawText, "Ideas for Mum");
  const third = await saveAndEnrich({ sourceType: "link", content: "https://en.wikipedia.org/wiki/Birthday_cake", note: "different words" }, repo, titled);
  assert.equal(third.memory.rawText, "Ideas for Mum", "an existing note is never overwritten");
  const named = await saveAndEnrich({ sourceType: "link", content: "https://example.com/n", title: "My name" }, repo, offline);
  assert.equal((await saveAndEnrich({ sourceType: "link", content: "https://example.com/n" }, repo, titled)).memory.title, "My name");
  // Pre-12I rows have no provenance; a hostname title is still recognised as a placeholder.
  const legacyState = createMemoryTestState([{ id: "40000000-0000-4000-8000-000000000001", userId: userA, title: "www.instagram.com", sourceType: "link", sourceUrl: "https://www.instagram.com/p/legacy1/",
    rawText: null, analysisStatus: "processing", metadata: { capture: "link" }, createdAt: "2026-10-30T10:00:00.000Z", updatedAt: "2026-10-30T10:00:00.000Z" }]);
  const legacy = await enrichSavedLink("40000000-0000-4000-8000-000000000001", repository(userA, legacyState), createInMemoryEnrichmentWriter(userA, legacyState), titled);
  assert.equal(legacy.memory.title, "Birthday cake");
  void named;
});
test("URL path words are searchable for saved links; opaque IDs are not", async () => {
  const repo = repository(); const offline = async (): Promise<MetadataResult> => ({ status: "unavailable", provider: null, provenance: {} });
  await saveAndEnrich({ sourceType: "link", content: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" }, repo, offline);
  await saveAndEnrich({ sourceType: "link", content: "https://www.tiktok.com/@baker.jo/video/7311223344556677889" }, repo, offline);
  const memories = await repo.searchCandidates(250);
  assert.equal(rankMemories(memories, "javascript docs", 5).items[0]?.sourceUrl, "https://developer.mozilla.org/en-US/docs/Web/JavaScript");
  assert.equal(rankMemories(memories, "7311223344556677889", 5).state, "no-match");
});
test("live 12I defect: enrichment (request 2) gives providers the longer budget, and a later retry completes a timed-out link", async () => {
  const source = await readFile("src/lib/capture/service.ts", "utf8");
  assert.match(source, /enrich: LinkEnricher = link => enrichLink\(link, \{ timeoutMs: ENRICHMENT_BUDGET_MS - 1_000 \}\)/);
  const repo = repository();
  const saved = await saveAndEnrich({ sourceType: "link", content: "https://example.com/slow-page" }, repo, async () => ({ status: "timed-out", provider: null, reason: "provider-timeout", provenance: {} }));
  assert.equal(saved.memory.metadata.enrichment, "timed-out");
  const retry = await saveAndEnrich({ sourceType: "link", content: "https://example.com/slow-page" }, repo, link => enrichLink(link, { resolve: publicDns, timeoutMs: 4_500,
    fetcher: async () => html("<meta property=\"og:title\" content=\"Slow but real\"><meta property=\"og:description\" content=\"Now stored\">") }));
  assert.equal(retry.memory.title, "Slow but real"); assert.equal((await repo.read(saved.memory.id)).metadata.caption, "Now stored");
});
test("save performs no network work at all (request 1)", async () => {
  const service = await readFile("src/lib/capture/service.ts", "utf8");
  const save = service.slice(service.indexOf("export async function capture("), service.indexOf("const ASCII_TAG"));
  assert.doesNotMatch(save, /enrichLink|enrichSavedLink|fetch\(|withinBudget|enrich\(/);
});
