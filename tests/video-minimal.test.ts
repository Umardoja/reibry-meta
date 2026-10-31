// Stage 12I-2C: short/static clip reliability. A valid but minimal Muse answer (one still scene, no motion, no background, no objects, no
// separate observations) must be accepted without inventing anything; a truly unverifiable answer must still fail safely, keep the video
// and store nothing. All provider responses here are synthetic mocks; no network.
import assert from "node:assert/strict";
import test from "node:test";
import { NOT_DESCRIBED, parseTranscription, parseVisualAnalysisDetailed, VideoContractError } from "../src/lib/video/contracts.ts";
import { analyzeVideoVisual, VideoProviderFailure } from "../src/lib/video/providers.ts";
import { runVideoStep, saveVideo, VideoStepRefused, type VideoAnalyzers } from "../src/lib/video/service.ts";
import { createInMemoryMemoryRepository, createMemoryTestState } from "./support/in-memory-memory-repository.ts";
import { createInMemoryVideoStore } from "./support/in-memory-video-store.ts";

const at = "2026-10-31T09:00:00.000Z"; const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// The shape a 4 s single-scene still clip ("PICNIC LIST", yellow, purple rectangle) can plausibly produce.
const picnic = { scenes: [{ approx_start_seconds: 0, approx_end_seconds: 4, background: "solid yellow", visible_objects: ["purple rectangle in the center"],
  on_screen_text: ["PICNIC LIST"], motion: "" }], visible_observations: [] as string[], interpretations: [] as unknown[], occasion_or_use_case: [] as unknown[],
  uncertain_or_not_visible: ["no people visible"] };
const empty = { approx_start_seconds: 0, approx_end_seconds: 4, background: "", visible_objects: [], on_screen_text: [], motion: "" };
const parse = (output: unknown) => parseVisualAnalysisDetailed(output, at);
const reject = (output: unknown, field: RegExp) => assert.throws(() => parse(output), (error: Error) => error instanceof VideoContractError && field.test(error.message));

test("one static 4 s scene with no motion and no separate observations is accepted, restating only what Muse described", () => {
  const { visual, normalizations } = parse(picnic);
  assert.equal(visual.scenes.length, 1); assert.deepEqual([visual.scenes[0].startSeconds, visual.scenes[0].endSeconds], [0, 4]);
  assert.equal(visual.scenes[0].motion, NOT_DESCRIBED, "no motion is recorded as not described, never as invented movement");
  assert.deepEqual(visual.observations, ['0–4 s: solid yellow background; purple rectangle in the center; on-screen text "PICNIC LIST"']);
  assert.deepEqual(normalizations.sort(), ["motion-not-described", "observations-restated-from-scenes"]);
});
test("missing background and missing object categories are valid; placeholders never become observations", () => {
  const { visual, normalizations } = parse({ ...picnic, scenes: [{ ...picnic.scenes[0], background: "", visible_objects: [] }] });
  assert.equal(visual.scenes[0].background, NOT_DESCRIBED); assert.deepEqual(visual.scenes[0].objects, []);
  assert.deepEqual(visual.observations, ['0–4 s: on-screen text "PICNIC LIST"']); assert.ok(!visual.observations.some(item => item.includes(NOT_DESCRIBED)));
  assert.ok(normalizations.includes("background-not-described"));
  const withObservations = parse({ ...picnic, scenes: [{ ...picnic.scenes[0], visible_objects: [] }], visible_observations: ["plain yellow frame with black title text"] });
  assert.deepEqual(withObservations.visual.observations, ["plain yellow frame with black title text"]);
  assert.ok(!withObservations.normalizations.includes("observations-restated-from-scenes"));
});
test("an answer with nothing observable, reversed timestamps, missing fields or wrong types is still rejected", () => {
  reject({ ...picnic, scenes: [empty] }, /observations/);
  reject({ ...picnic, scenes: [{ ...picnic.scenes[0], approx_start_seconds: 3, approx_end_seconds: 1 }] }, /scene times/);
  reject({ ...picnic, scenes: [] }, /scenes/);
  reject({ ...picnic, scenes: [{ ...picnic.scenes[0], approx_end_seconds: "4" }] }, /scene end/);
  reject({ ...picnic, scenes: [{ ...picnic.scenes[0], motion: 5 }] }, /scene text/);
  const missing: Record<string, unknown> = { ...picnic }; delete missing.uncertain_or_not_visible; reject(missing, /visual analysis/);
  reject({ ...picnic, transcript: "forged speech" }, /visual analysis/);
});
test("incomplete optional inferences are dropped, never repaired or promoted to observations", () => {
  const { visual, normalizations } = parse({ ...picnic, visible_observations: ["yellow background with title text"],
    interpretations: [{ claim: "looks like a picnic checklist title card", based_on: "" }, { claim: "a title card", based_on: "large centred text" }],
    occasion_or_use_case: [{ suggestion: "", basis: "inferred" }, { suggestion: "picnic planning", basis: "spoken" }, { suggestion: "a list title", basis: "visible" }] });
  assert.deepEqual(visual.interpretations, [{ claim: "a title card", basedOn: "large centred text" }]);
  assert.deepEqual(visual.occasions, [{ suggestion: "a list title", basis: "visible" }]);
  assert.deepEqual(visual.observations, ["yellow background with title text"], "interpretations never become observations");
  assert.deepEqual(normalizations.sort(), ["interpretation-dropped", "motion-not-described", "occasion-dropped"]);
});

const env = { MODEL_API_KEY: "LLM_test_synthetic-only-key", META_RATE_LIMIT_MODE: "in-memory" };
const usage = { input_tokens: 1210, output_tokens: 640, total_tokens: 1850 };
const envelope = (text: string, extra: Record<string, unknown> = {}) => ({ status: "completed", store: false, model: "muse-spark-1.3", incomplete_details: null,
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }], usage, ...extra });
const respond = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
const mp4 = () => { const bytes = new Uint8Array(64); bytes.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]); return bytes; };
async function outcome(body: unknown) {
  try { const result = await analyzeVideoVisual(mp4(), new AbortController().signal, { env, fetch: respond(body) }); return { ok: true as const, ...result }; }
  catch (error) { assert.ok(error instanceof VideoProviderFailure); return { ok: false as const, code: error.code, diagnostic: error.diagnostic, usage: error.usage }; }
}
test("provider-format outcomes are classified exactly; a rejected (billed) answer keeps its token usage", async () => {
  const ok = await outcome(envelope(JSON.stringify(picnic)));
  assert.ok(ok.ok); assert.deepEqual(ok.normalizations.sort(), ["motion-not-described", "observations-restated-from-scenes"]); assert.equal(ok.usage?.inputTokens, 1210);
  assert.ok((await outcome(envelope(JSON.stringify(picnic), { incomplete_details: {} }))).ok, "an empty incomplete_details beside completed is not a truncation");
  const cases: Array<[unknown, string]> = [
    [envelope(JSON.stringify(picnic), { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), "status-incomplete-incomplete"],
    [envelope(JSON.stringify(picnic), { incomplete_details: { reason: "content_filter" } }), "status-completed-incomplete"],
    [{ ...envelope(""), output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "cannot help" }] }] }, "refusal"],
    [envelope("{\"scenes\":"), "output-json"], [envelope(""), "output-empty"],
    [envelope(JSON.stringify({ ...picnic, scenes: [{ ...picnic.scenes[0], approx_start_seconds: 3, approx_end_seconds: 1 }] })), "schema:scene times"],
    [envelope(JSON.stringify({ ...picnic, scenes: [empty] })), "schema:observations"],
  ];
  for (const [body, diagnostic] of cases) {
    const result = await outcome(body); assert.ok(!result.ok, diagnostic);
    assert.equal(result.code, "invalid-provider-output"); assert.equal(result.diagnostic, diagnostic); assert.equal(result.usage?.outputTokens, 640, `${diagnostic} keeps usage`);
  }
});

test("4 s clip journey: unverifiable answer stores nothing and keeps the video; bounded retry succeeds; no-speech audio is honest; result survives reload", async () => {
  const state = createMemoryTestState(); const objects = new Map<string, Uint8Array>(); const paths = new Map<string, string>();
  const repository = createInMemoryMemoryRepository(userA, state); const store = createInMemoryVideoStore(userA, state, objects, paths);
  let answer: unknown = { ...picnic, scenes: [empty] }; let visualCalls = 0; let transcribeCalls = 0;
  const analyzers: VideoAnalyzers = {
    probe: async () => ({ durationMs: 4_000, width: 320, height: 180, hasAudio: true }),
    visual: async bytes => { visualCalls++; return analyzeVideoVisual(bytes, new AbortController().signal, { env, fetch: respond(envelope(JSON.stringify(answer))) }); },
    extractSpeech: async () => new Uint8Array(44),
    // A pure tone: Voice Transcribe returns an empty transcript (recorded response shape, not a live call).
    transcribe: async () => { transcribeCalls++; return parseTranscription({ sessionId: "s", transcript: "", audioDurationMs: 4_000, turns: [] }); },
  };
  const { memory } = await saveVideo({ bytes: mp4(), title: "Synthetic PICNIC LIST clip", note: null, consent: true }, userA, repository, store, analyzers);
  const failed = await runVideoStep(memory.id, "visual", repository, store, analyzers);
  assert.equal(failed.memory.video?.status, "failed"); assert.equal(failed.memory.video?.visual, null, "verified evidence is required before anything is stored");
  assert.deepEqual(failed.failure, { code: "invalid-provider-output", diagnostic: "schema:observations" }); assert.equal(failed.usage?.inputTokens, 1210);
  assert.equal(objects.size, 1, "the original saved video is preserved");
  answer = picnic;
  const visual = await runVideoStep(memory.id, "visual", repository, store, analyzers);
  assert.equal(visual.memory.video?.status, "pending"); assert.equal(visual.memory.video?.visualAttempts, 2);
  assert.deepEqual(visual.normalizations.sort(), ["motion-not-described", "observations-restated-from-scenes"]);
  const ready = await runVideoStep(memory.id, "speech", repository, store, analyzers);
  assert.equal(ready.memory.video?.status, "ready"); assert.equal(ready.memory.video?.transcript?.text, "");
  assert.match(ready.memory.video?.summary ?? "", /^Video with 1 scene: "PICNIC LIST" \(purple rectangle in the center, solid yellow\)\. No speech was transcribed\.$/);
  assert.deepEqual(await createInMemoryMemoryRepository(userA, state).read(memory.id).then(item => item.video), ready.memory.video, "the result survives a fresh read");
  assert.equal(visualCalls, 2); assert.equal(transcribeCalls, 1);
  await assert.rejects(runVideoStep(memory.id, "visual", repository, store, analyzers), (error: VideoStepRefused) => error.reason === "already-analysed");
});
test("attempt limit: after two rejected visual answers the step is closed, the video stays, and nothing was stored", async () => {
  const state = createMemoryTestState(); const objects = new Map<string, Uint8Array>(); const repository = createInMemoryMemoryRepository(userA, state);
  const store = createInMemoryVideoStore(userA, state, objects, new Map()); let calls = 0;
  const analyzers: VideoAnalyzers = { probe: async () => ({ durationMs: 4_000, width: 320, height: 180, hasAudio: false }),
    visual: async () => { calls++; throw new VideoProviderFailure("invalid-provider-output", "refusal"); },
    extractSpeech: async () => new Uint8Array(0), transcribe: async () => { throw new Error("unused"); } };
  const { memory } = await saveVideo({ bytes: mp4(), title: null, note: null, consent: true }, userA, repository, store, analyzers);
  await runVideoStep(memory.id, "visual", repository, store, analyzers); const second = await runVideoStep(memory.id, "visual", repository, store, analyzers);
  assert.equal(second.memory.video?.visualAttempts, 2); assert.equal(second.memory.video?.visual, null); assert.equal(second.failure?.diagnostic, "refusal");
  await assert.rejects(runVideoStep(memory.id, "visual", repository, store, analyzers), (error: VideoStepRefused) => error.reason === "unavailable");
  assert.equal(calls, 2); assert.equal(objects.size, 1);
});
