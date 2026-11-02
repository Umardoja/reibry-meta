// Stage 12K-1: a TikTok with no platform details becomes useful through the user's own optional words, added after the save through the
// owner-only Memory update, and through TikTok's official player loaded only on request. Nothing here claims REIBRY read the video. No network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { toModelEvidence } from "../src/lib/ai/meta/contracts.ts";
import { parseUpdateMemory } from "../src/lib/memory/contracts.ts";
import type { Memory } from "../src/lib/memory/contracts.ts";
import { presentMemory, tiktokPlayerUrl } from "../src/lib/memory/presentation.ts";
import { rankMemories } from "../src/lib/retrieval/service.ts";
import { createMemoryTestState } from "./support/in-memory-memory-repository.ts";
import { saveAndEnrich, trackedRepository } from "./support/capture-flow.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const short = "https://vt.tiktok.com/ZSg3F9G3P/";
const noTitle = async () => ({ status: "partial" as const, provider: "tiktok-oembed" as const, reason: "provider-returned-no-title", author: "@baker.jo", provenance: { author: "url" as const } });
const link = (metadata: Memory["metadata"], overrides: Partial<Memory> = {}): Memory => ({ id: "60000000-0000-4000-8000-000000000001", userId: userA, title: "TikTok video", sourceType: "link",
  sourceUrl: short, rawText: null, analysisStatus: "processing", metadata, createdAt: "2026-10-31T09:00:00.000Z", updatedAt: "2026-10-31T09:00:00.000Z", ...overrides });

test("the after-save note uses the existing owner update: a note alone is a valid update, title and source are untouched", async () => {
  assert.deepEqual(parseUpdateMemory({ rawText: "Pasta bake to try on Sunday" }), { rawText: "Pasta bake to try on Sunday" });
  const repo = trackedRepository(userA, createMemoryTestState());
  const saved = await saveAndEnrich({ sourceType: "link", content: short }, repo, noTitle);
  assert.equal(saved.memory.metadata.enrichment, "partial");
  const updated = await repo.update(saved.memory.id, parseUpdateMemory({ rawText: "Creamy pasta bake with spinach, for Sunday lunch" }));
  assert.ok(updated); assert.equal(updated.title, saved.memory.title); assert.equal(updated.sourceUrl, saved.memory.sourceUrl);
  assert.deepEqual(updated.metadata, saved.memory.metadata, "platform details and provenance are not rewritten");
  assert.equal((await repo.searchCandidates(250)).length, 1, "no duplicate Memory");
});

test("the added note is searchable, reaches Home only as the user's note, and is labelled as the user's own words", async () => {
  const repo = trackedRepository(userA, createMemoryTestState());
  const saved = await saveAndEnrich({ sourceType: "link", content: short }, repo, noTitle);
  await saveAndEnrich({ sourceType: "link", content: "https://www.tiktok.com/@other/video/7300000000000000001" }, repo, noTitle);
  await repo.update(saved.memory.id, { rawText: "Creamy pasta bake with spinach, for Sunday lunch" });
  const memories = await repo.searchCandidates(250);
  const found = rankMemories(memories, "spinach pasta bake", 5);
  assert.equal(found.items.length, 1); assert.equal(found.items[0].memoryId, saved.memory.id);
  const [evidence] = toModelEvidence(found.items);
  assert.equal(evidence.link_details?.user_note, "Creamy pasta bake with spinach, for Sunday lunch");
  assert.equal(evidence.link_details?.provider_caption, null, "never presented as TikTok's caption"); assert.equal(evidence.link_details?.shared_with_link, null);
  const view = presentMemory(memories.find(item => item.id === saved.memory.id)!);
  assert.equal(view.note, "Creamy pasta bake with spinach, for Sunday lunch"); assert.equal(view.summary, null, "a note is not a platform description");
  assert.ok(view.unknown.includes("A caption or description")); assert.equal(view.title, "Saved TikTok video");
});

test("TikTok's official player URL is built only from a verified numeric post ID, with autoplay off", () => {
  assert.equal(tiktokPlayerUrl(link({ platform: "tiktok", postId: "7696611605374602518" })), "https://www.tiktok.com/player/v1/7696611605374602518?autoplay=0&description=1&music_info=1&rel=0");
  for (const postId of ["", "abc", "7696611605374602518?x=1", "123", "7696611605374602518/../x", "7".repeat(30)]) assert.equal(tiktokPlayerUrl(link({ platform: "tiktok", postId })), null, postId);
  assert.equal(tiktokPlayerUrl(link({ platform: "tiktok" })), null, "no unverified ID, no player");
  assert.equal(tiktokPlayerUrl(link({ platform: "youtube", postId: "7696611605374602518" })), null);
  assert.equal(tiktokPlayerUrl(link({ platform: "tiktok", postId: "7696611605374602518" }, { sourceType: "text" })), null);
});

test("UI: one optional, skippable question after a limited save; no audio recording; the player loads only on request in a sandbox", async () => {
  const form = await readFile("src/components/capture/capture-form.tsx", "utf8");
  for (const text of ["What caught your eye?", ">Skip<", "method: \"PATCH\"", "JSON.stringify({ rawText: note })", "view.details.state === \"limited\"", "data-handoff"]) assert.ok(form.includes(text), text);
  assert.doesNotMatch(form, /getUserMedia|MediaRecorder|autoFocus/, "dictation is the keyboard's; the question never grabs focus");
  const detail = await readFile("src/components/memory/memory-detail.tsx", "utf8");
  assert.match(detail, /rawText: note\.trim\(\) \? note : null/, "clearing an optional saved-link note sends an explicit null");
  assert.match(detail, /\{player && preview && <div className="tiktok-preview"/, "the iframe exists only after the user asks");
  assert.match(detail, /sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"/);
  assert.match(detail, /REIBRY doesn&apos;t read, save or search what it shows/);
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML|autoplay=1/);
  const card = await readFile("src/components/memory/memory-visual.tsx", "utf8");
  assert.ok(card.includes("view.summary?.text ?? view.note"), "the Memories list shows the user's note when the platform gave nothing");
});
