// Stage 12K: words a share sheet sends with a link are kept as "Shared with the link": cleaned, separate from the user's note, never
// labelled as an official platform caption, searchable and cited to Home with their real provenance. No network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { toModelEvidence } from "../src/lib/ai/meta/contracts.ts";
import { parseCaptureInput, CaptureContractError } from "../src/lib/capture/contracts.ts";
import { capture } from "../src/lib/capture/service.ts";
import { cleanSharedText, parseSharedFragment, SHARED_WITH_LINK_MAX } from "../src/lib/capture/share.ts";
import { presentMemory } from "../src/lib/memory/presentation.ts";
import { rankMemories } from "../src/lib/retrieval/service.ts";
import { createMemoryTestState } from "./support/in-memory-memory-repository.ts";
import { saveAndEnrich, trackedRepository } from "./support/capture-flow.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const short = "https://vt.tiktok.com/ZSg3F9G3P/";
const noTitle = async () => ({ status: "partial" as const, provider: "tiktok-oembed" as const, reason: "provider-returned-no-title", author: "@baker.jo", provenance: { author: "url" as const } });

test("share-sheet boilerplate, links and bare handles are removed; meaningful words survive and are bounded", () => {
  assert.equal(cleanSharedText(`Check out baker.jo's video! #TikTok ${short}`), "");
  assert.equal(cleanSharedText(`${short}`), "");
  assert.equal(cleanSharedText("@baker.jo"), "");
  assert.equal(cleanSharedText("Watch more amazing videos on TikTok! Download TikTok"), "");
  assert.equal(cleanSharedText(`Pink ombre birthday cake with gold leaf 🎂 #cakedecorating #birthdaycake ${short} Shared via TikTok`), "Pink ombre birthday cake with gold leaf 🎂 #cakedecorating #birthdaycake");
  assert.equal(cleanSharedText("#TikTokMadeMeBuyIt pasta bake"), "#TikTokMadeMeBuyIt pasta bake", "only the bare #TikTok tag is boilerplate");
  assert.equal(cleanSharedText(`a${"b".repeat(3000)}`).length, SHARED_WITH_LINK_MAX);
  assert.equal(cleanSharedText("line one\u0000\u0007 line two"), "line one line two");
});

test("the Shortcut fragment can carry the original share text alongside the URL", () => {
  const text = `Small bedroom makeover ideas #roomdecor ${short}`;
  const payload = parseSharedFragment(`#url=${encodeURIComponent(short)}&text=${encodeURIComponent(text)}`);
  assert.equal(payload?.url, short); assert.equal(cleanSharedText(payload?.note ?? ""), "Small bedroom makeover ideas #roomdecor");
  assert.equal(cleanSharedText(parseSharedFragment(`#url=${encodeURIComponent(short)}&text=${encodeURIComponent(short)}`)?.note ?? ""), "", "URL-only input stays URL-only");
});

test("the capture contract accepts sharedText for links only", () => {
  assert.equal(parseCaptureInput({ sourceType: "link", content: short, sharedText: "Pasta recipe" }).sharedText, "Pasta recipe");
  assert.throws(() => parseCaptureInput({ sourceType: "text", content: "note", sharedText: "x" }), CaptureContractError);
  assert.throws(() => parseCaptureInput({ sourceType: "link", content: short, sharedText: "x".repeat(5_001) }), CaptureContractError);
});

test("shared words are stored apart from the note with share-sheet provenance, survive enrichment, and never claim to be a caption", async () => {
  const repo = trackedRepository(userA, createMemoryTestState());
  const saved = await capture({ sourceType: "link", content: short, note: "For Mum's 60th", sharedText: `Check out baker.jo's video! Pink ombre birthday cake with gold leaf #birthdaycake ${short}` }, repo);
  assert.equal(saved.memory.rawText, "For Mum's 60th", "the user's note is untouched");
  assert.equal(saved.memory.metadata.sharedText, "Pink ombre birthday cake with gold leaf #birthdaycake");
  assert.equal((saved.memory.metadata.provenance as Record<string, string>).sharedText, "share-sheet");
  assert.equal(saved.memory.metadata.caption, undefined, "not presented as a platform caption");
  const enriched = await saveAndEnrich({ sourceType: "link", content: short }, repo, noTitle);
  assert.equal(enriched.memory.id, saved.memory.id); assert.equal(enriched.memory.metadata.sharedText, "Pink ombre birthday cake with gold leaf #birthdaycake", "kept after enrichment");
  assert.equal((enriched.memory.metadata.provenance as Record<string, string>).sharedText, "share-sheet");
  const empty = await capture({ sourceType: "link", content: "https://vt.tiktok.com/ZSother01/", sharedText: "Check out this video! #TikTok" }, repo);
  assert.equal(empty.memory.metadata.sharedText, undefined, "boilerplate-only share text stores nothing");
});

test("shared words are shown with honest provenance, searchable, and cited to Home as shared_with_link", async () => {
  const repo = trackedRepository(userA, createMemoryTestState());
  await saveAndEnrich({ sourceType: "link", content: short, sharedText: "Easy creamy garlic pasta recipe: spaghetti, parmesan, spinach" }, repo, noTitle);
  await saveAndEnrich({ sourceType: "link", content: "https://www.tiktok.com/@other/video/7300000000000000001" }, repo, noTitle);
  const memories = await repo.searchCandidates(250);
  const found = rankMemories(memories, "Where's the pasta recipe from TikTok?", 5);
  assert.equal(found.items[0].sourceDetails?.sharedWithLink, "Easy creamy garlic pasta recipe: spaghetti, parmesan, spinach");
  assert.equal(rankMemories(memories, "spinach parmesan", 5).items.length, 1, "ingredients are searchable");
  const [evidence] = toModelEvidence(found.items);
  assert.equal(evidence.link_details?.shared_with_link, "Easy creamy garlic pasta recipe: spaghetti, parmesan, spinach");
  assert.equal(evidence.link_details?.provider_caption, null); assert.equal(evidence.link_details?.user_note, null);
  const memory = memories.find(item => item.metadata.sharedText)!; const view = presentMemory(memory);
  assert.deepEqual(view.summary, { text: "Easy creamy garlic pasta recipe: spaghetti, parmesan, spinach", from: "Shared with the link" });
  assert.ok(view.knows.some(group => group.heading === "Shared with the link"));
  assert.ok(view.unknown.includes("A caption or description"), "still honest that the platform's own description was not retrieved");
  assert.equal(view.details.message, "No description or cover is available from this source.");
});

test("Capture keeps shared words out of the note box, lets the user drop them, and Home is told they are not an official caption", async () => {
  const form = await readFile("src/components/capture/capture-form.tsx", "utf8");
  assert.match(form, /const prefill = \(payload: SharedPayload \| null\) => payload\?\.url \?\? ""/);
  for (const text of ["Shared with the link:", "Don&apos;t keep", "incomingSharedText ? { sharedText: incomingSharedText }", "detected.url === initial?.url"]) assert.ok(form.includes(text), text);
  const prompt = await readFile("src/lib/ai/meta/grounded-reasoning.ts", "utf8");
  assert.match(prompt, /shared_with_link, sent by the phone's share sheet: not an\s+official caption/);
});
