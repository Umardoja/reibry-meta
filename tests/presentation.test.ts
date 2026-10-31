// Stage 12J-3: the consumer view of a Memory must only show stored facts, labelled by source, and never engineering fields.
import assert from "node:assert/strict";
import test from "node:test";
import { readShareArrival } from "../src/lib/capture/share.ts";
import type { Memory } from "../src/lib/memory/contracts.ts";
import { presentMemory, safeThumbnail, savedLabel } from "../src/lib/memory/presentation.ts";

const now = new Date("2026-10-31T15:00:00.000Z");
const base = (overrides: Partial<Memory>): Memory => ({ id: "60000000-0000-4000-8000-000000000001", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "x", sourceType: "link",
  sourceUrl: "https://www.tiktok.com/@baker.jo/video/7311223344556677889", rawText: null, analysisStatus: "processing", metadata: {}, createdAt: "2026-10-31T09:00:00.000Z", updatedAt: "2026-10-31T09:00:00.000Z", ...overrides });
const engineering = /processing|metadata-only|evidence|reibry-placeholder|enrichment|provenance|source_type|analysis_status|sourceType/i;

test("a TikTok saved before details arrived: honest generic title, creator from the link, nothing invented", () => {
  const view = presentMemory(base({ title: "TikTok video by @baker.jo", metadata: { capture: "link", platform: "tiktok", enrichment: "partial", enrichmentReason: "provider-returned-no-title", author: "@baker.jo", provenance: { title: "reibry-placeholder", author: "url" } } }), now);
  assert.equal(view.title, "Saved TikTok video"); assert.equal(view.titleIsGeneric, true); assert.equal(view.creator, "@baker.jo");
  assert.equal(view.summary, null, "no description from a URL alone"); assert.equal(view.thumbnail, null); assert.equal(view.kind, "tiktok"); assert.equal(view.openLabel, "Open on TikTok");
  assert.equal(view.details.state, "limited"); assert.match(view.details.message ?? "", /didn't share its caption or cover/);
  assert.ok(view.unknown.some(item => /hasn't watched/.test(item)), "says the video itself was not watched");
  assert.doesNotMatch(JSON.stringify({ ...view, originalUrl: null }), engineering);
});
test("a real title is kept even if an old placeholder marker was left behind (live MDN case)", () => {
  const view = presentMemory(base({ title: "JavaScript | MDN", sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", metadata: { platform: "web", siteName: "MDN Web Docs", provenance: { title: "reibry-placeholder" } } }), now);
  assert.equal(view.title, "JavaScript | MDN"); assert.equal(view.kindLabel, "MDN Web Docs");
});
test("platform caption, cover and creator are shown and attributed; the user's note stays separate", () => {
  const view = presentMemory(base({ title: "Pink birthday cake tutorial", sourceUrl: "https://www.youtube.com/watch?v=abc", rawText: "For Mum's 60th",
    metadata: { platform: "youtube", enrichment: "complete", author: "Bake Studio", caption: "Three-layer pink cake with buttercream roses", thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg", hashtags: ["cake", "birthday"], provenance: { title: "youtube-oembed" } } }), now);
  assert.deepEqual(view.summary, { text: "Three-layer pink cake with buttercream roses", from: "From YouTube" });
  assert.equal(view.note, "For Mum's 60th"); assert.equal(view.thumbnail, "https://i.ytimg.com/vi/abc/hqdefault.jpg"); assert.deepEqual(view.hashtags, ["cake", "birthday"]);
  assert.equal(view.knows[0].heading, "Shared by YouTube"); assert.ok(view.knows.some(group => group.heading === "From you" && group.items.some(item => item.includes("For Mum's 60th"))));
  assert.equal(view.details.state, "ready"); assert.equal(view.details.message, null);
});
test("covers must be https; anything else falls back to the platform tile", () => {
  assert.equal(safeThumbnail("http://example.com/a.jpg"), null); assert.equal(safeThumbnail("javascript:alert(1)"), null);
  assert.equal(safeThumbnail("https://user:pw@cdn.example/a.jpg"), null); assert.equal(safeThumbnail(42 as never), null);
});
test("notes describe themselves from their own text, never a URL", () => {
  const view = presentMemory(base({ sourceType: "text", sourceUrl: null, title: "Weekend packing", rawText: "Weekend packing\nCharger, ID card, light jacket", metadata: {} }), now);
  assert.equal(view.kind, "note"); assert.equal(view.title, "Weekend packing"); assert.deepEqual(view.summary, { text: "Charger, ID card, light jacket", from: "Your note" });
  assert.equal(view.originalUrl, null); assert.deepEqual(view.unknown, []);
});
test("analysed video: facts are labelled as seen or heard, interpretations are marked as not facts", () => {
  const view = presentMemory(base({ sourceType: "video", sourceUrl: null, title: "Video · 15 s", metadata: { capture: "video" }, video: { status: "ready", durationMs: 15000, sizeBytes: 1, hasAudio: true, width: 640, height: 360,
    consentAt: now.toISOString(), failureCode: null, visualAttempts: 1, speechAttempts: 1, summary: "s", concepts: [], analyzedAt: now.toISOString(),
    visual: { model: "muse-spark-1.3", fps: 1, analyzedAt: now.toISOString(), scenes: [], observations: ["red square on dark blue"], interpretations: [{ claim: "a step sequence", basedOn: "on-screen text" }], gaps: ["no people visible"], occasions: [] },
    transcript: { model: "muse-voice-transcribe-1.0", text: "buy oat milk", durationMs: 10000, turns: [] } } }), now);
  assert.equal(view.title, "Your saved video"); assert.equal(view.videoAnalysed, true); assert.equal(view.summary?.from, "From REIBRY's look at your video");
  assert.deepEqual(view.knows.map(group => group.heading), ["Seen in your video", "Heard in your video", "REIBRY's interpretation (not a fact)"]);
  assert.ok(!JSON.stringify(view).includes("muse-"), "model names never reach the screen");
});
test("saved dates read naturally", () => {
  assert.equal(savedLabel("2026-10-31T14:59:30.000Z", now), "Saved just now"); assert.equal(savedLabel("2026-10-31T08:00:00.000Z", now), "Saved today");
  assert.equal(savedLabel("2026-10-30T08:00:00.000Z", now), "Saved yesterday"); assert.equal(savedLabel("2026-10-27T08:00:00.000Z", now), "Saved 4 days ago");
  assert.match(savedLabel("2026-09-02T08:00:00.000Z", now), /^Saved \d+ Sep|^Saved Sep \d+/);
});
test("share arrival: an empty #url= from a broken Shortcut is reported, not silently ignored", () => {
  assert.deepEqual(readShareArrival("", "#url="), { arrived: true, fromShortcut: false, payload: null, received: "" });
  assert.equal(readShareArrival("", "#src=shortcut&url=").fromShortcut, true);
  assert.equal(readShareArrival("", `#url=${encodeURIComponent("https://vm.tiktok.com/ZMabc123/")}`).payload?.url, "https://vm.tiktok.com/ZMabc123/");
  assert.equal(readShareArrival("?url=javascript%3Aalert(1)", "").payload, null); assert.equal(readShareArrival("?url=javascript%3Aalert(1)", "").arrived, true);
  assert.equal(readShareArrival("", "").arrived, false);
});
