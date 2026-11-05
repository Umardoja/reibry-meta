// Stage 12I-2B: user-supplied short video Memories. Shared by server and client; no secrets, no I/O.
// Visual findings come only from Muse Spark video input; speech only from Muse Voice Transcribe. Muse Spark's own audio guesses are
// never requested or stored (Stage 12I-2A: it reported "no speech" while echoing a spoken word).
export const VIDEO_MAX_BYTES = 20_000_000;
export const VIDEO_MAX_DURATION_MS = 20_000;
export const VIDEO_BUCKET = "memory-videos";
export const VIDEO_STEP_ATTEMPTS = 2;
export const VIDEO_VISUAL_MODEL = "muse-spark-1.3";
export const VIDEO_SPEECH_MODEL = "muse-voice-transcribe-1.0";
export const VIDEO_FPS = 1;

export type VideoStatus = "pending" | "processing" | "ready" | "failed";
export type VideoStep = "visual" | "speech";
export type VideoFailureCode = "provider-timeout" | "provider-unavailable" | "provider-rejected" | "invalid-provider-output" | "media-unavailable" |
  "audio-extraction-failed" | "not-configured";
export type VideoScene = { startSeconds: number; endSeconds: number; background: string; objects: string[]; onScreenText: string[]; motion: string };
export type VideoVisual = { model: typeof VIDEO_VISUAL_MODEL; fps: number; analyzedAt: string; scenes: VideoScene[]; observations: string[];
  interpretations: Array<{ claim: string; basedOn: string }>; gaps: string[]; occasions: Array<{ suggestion: string; basis: "visible" | "inferred" }> };
export type VideoTranscript = { model: typeof VIDEO_SPEECH_MODEL; text: string; durationMs: number; turns: Array<{ startMs: number; endMs: number; text: string }> };
export type MemoryVideo = { status: VideoStatus; durationMs: number; sizeBytes: number; hasAudio: boolean; width: number | null; height: number | null;
  consentAt: string; failureCode: VideoFailureCode | null; visualAttempts: number; speechAttempts: number; visual: VideoVisual | null;
  transcript: VideoTranscript | null; summary: string | null; concepts: string[]; analyzedAt: string | null };

export class VideoContractError extends Error {}
const failureCodes = new Set<VideoFailureCode>(["provider-timeout", "provider-unavailable", "provider-rejected", "invalid-provider-output", "media-unavailable",
  "audio-extraction-failed", "not-configured"]);

function record(value: unknown, what: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VideoContractError(`Invalid ${what}.`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[], what: string) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new VideoContractError(`Invalid ${what}.`);
}
function text(value: unknown, max: number, what: string, min = 1) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) throw new VideoContractError(`Invalid ${what}.`);
  return value.trim();
}
function strings(value: unknown, maxItems: number, maxLength: number, what: string) {
  if (!Array.isArray(value) || value.length > maxItems) throw new VideoContractError(`Invalid ${what}.`);
  return value.map(item => text(item, maxLength, what));
}
function number(value: unknown, min: number, max: number, what: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new VideoContractError(`Invalid ${what}.`);
  return value;
}
const clip = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max);
/** Scene background/motion Muse left blank is recorded as "not described", never guessed. */
export const NOT_DESCRIBED = "not described";
const blank = (value: unknown, max: number) => { if (value !== undefined && typeof value !== "string") throw new VideoContractError("Invalid scene text."); return value?.trim() ? clip(value, max) : NOT_DESCRIBED; };

/** JSON schema Muse Spark must follow. There is deliberately no speech field. */
export const visualAnalysisSchema = (() => {
  const list = { type: "array", items: { type: "string" } };
  return { type: "object", additionalProperties: false, required: ["scenes", "visible_observations", "interpretations", "occasion_or_use_case", "uncertain_or_not_visible"],
    properties: {
      scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["approx_start_seconds", "approx_end_seconds", "background", "visible_objects", "on_screen_text", "motion"],
        properties: { approx_start_seconds: { type: "number" }, approx_end_seconds: { type: "number" }, background: { type: "string" }, visible_objects: list, on_screen_text: list, motion: { type: "string" } } } },
      visible_observations: list,
      interpretations: { type: "array", items: { type: "object", additionalProperties: false, required: ["claim", "based_on"], properties: { claim: { type: "string" }, based_on: { type: "string" } } } },
      occasion_or_use_case: { type: "array", items: { type: "object", additionalProperties: false, required: ["suggestion", "basis"], properties: { suggestion: { type: "string" }, basis: { type: "string", enum: ["visible", "inferred"] } } } },
      uncertain_or_not_visible: list } } as const;
})();

/** Sanitized names of the safe normalizations applied to a valid but minimal Muse answer (never content). */
export type VisualNormalization = "background-not-described" | "motion-not-described" | "observations-restated-from-scenes" | "interpretation-dropped" | "occasion-dropped";

/**
 * Converts Muse Spark's structured output into the stored shape, clipping to the database bounds. A valid but minimal answer (one still
 * scene, no motion, no background, no objects, no separate observation list) is accepted, and every normalization is reported. Nothing is
 * ever invented: blanks become "not described", incomplete optional items are dropped, and observations are only ever restated from facts
 * Muse itself put in its scenes. Malformed output (no scenes, wrong types, impossible or reversed timestamps, nothing observable) is rejected.
 */
export function parseVisualAnalysisDetailed(output: unknown, analyzedAt: string, fps = VIDEO_FPS): { visual: VideoVisual; normalizations: VisualNormalization[] } {
  const notes = new Set<VisualNormalization>();
  const body = record(output, "visual analysis");
  exactKeys(body, ["scenes", "visible_observations", "interpretations", "occasion_or_use_case", "uncertain_or_not_visible"], "visual analysis");
  if (!Array.isArray(body.scenes) || !body.scenes.length) throw new VideoContractError("Invalid scenes.");
  const strings = (value: unknown, max: number, length: number) => (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, max).map(item => clip(item, length));
  const scenes = body.scenes.slice(0, 12).map(value => {
    const scene = record(value, "scene");
    const startSeconds = number(scene.approx_start_seconds, 0, 60, "scene start"); const endSeconds = number(scene.approx_end_seconds, 0, 60, "scene end");
    if (endSeconds < startSeconds) throw new VideoContractError("Invalid scene times.");
    const background = blank(scene.background, 120); const motion = blank(scene.motion, 200);
    if (background === NOT_DESCRIBED) notes.add("background-not-described"); if (motion === NOT_DESCRIBED) notes.add("motion-not-described");
    return { startSeconds, endSeconds, background, objects: strings(scene.visible_objects, 8, 160), onScreenText: strings(scene.on_screen_text, 6, 120), motion };
  });
  let observations = strings(body.visible_observations, 20, 240);
  if (!observations.length) {
    // Restate only what Muse described inside its scenes; a "not described" placeholder is never turned into an observation.
    observations = scenes.flatMap(scene => {
      const facts = [scene.background !== NOT_DESCRIBED ? `${scene.background} background` : "", scene.objects.join(", "),
        scene.onScreenText.length ? `on-screen text "${scene.onScreenText.join(" / ")}"` : "", scene.motion !== NOT_DESCRIBED ? scene.motion : ""].filter(Boolean);
      return facts.length ? [clip(`${scene.startSeconds}–${scene.endSeconds} s: ${facts.join("; ")}`, 240)] : [];
    });
    if (!observations.length) throw new VideoContractError("Invalid observations.");
    notes.add("observations-restated-from-scenes");
  }
  // Interpretations and occasions are optional inferences: an incomplete one is dropped, never repaired or promoted to an observation.
  const interpretations = (Array.isArray(body.interpretations) ? body.interpretations : []).slice(0, 6).flatMap(value => {
    const item = record(value, "interpretation");
    if (typeof item.claim !== "string" || !item.claim.trim() || typeof item.based_on !== "string" || !item.based_on.trim()) { notes.add("interpretation-dropped"); return []; }
    return [{ claim: clip(item.claim, 240), basedOn: clip(item.based_on, 240) }]; });
  const occasions = (Array.isArray(body.occasion_or_use_case) ? body.occasion_or_use_case : []).slice(0, 6).flatMap(value => {
    const item = record(value, "occasion");
    if ((item.basis !== "visible" && item.basis !== "inferred") || typeof item.suggestion !== "string" || !item.suggestion.trim()) { notes.add("occasion-dropped"); return []; }
    return [{ suggestion: clip(item.suggestion, 120), basis: item.basis as "visible" | "inferred" }]; });
  return { visual: { model: VIDEO_VISUAL_MODEL, fps, analyzedAt, scenes, observations, interpretations, gaps: strings(body.uncertain_or_not_visible, 10, 240), occasions },
    normalizations: [...notes] };
}
export function parseVisualAnalysis(output: unknown, analyzedAt: string, fps = VIDEO_FPS): VideoVisual { return parseVisualAnalysisDetailed(output, analyzedAt, fps).visual; }

/** Converts a Muse Voice Transcribe response into the stored shape. An empty transcript is valid (silent audio). */
export function parseTranscription(body: unknown): VideoTranscript {
  const value = record(body, "transcription");
  if (typeof value.transcript !== "string" || !Array.isArray(value.turns)) throw new VideoContractError("Invalid transcription.");
  const turns = value.turns.map(item => record(item, "turn")).filter(turn => typeof turn.transcript === "string" && turn.transcript.trim()).slice(0, 50)
    .map(turn => ({ startMs: Math.round(number(turn.startMs, 0, 60_000, "turn start")), endMs: Math.round(number(turn.endMs, 0, 60_000, "turn end")), text: clip(turn.transcript as string, 1_000) }));
  return { model: VIDEO_SPEECH_MODEL, text: clip(value.transcript, 4_000), durationMs: Math.round(number(value.audioDurationMs, 0, 60_000, "audio duration")), turns };
}

/** Deterministic summary and search concepts built only from stored findings; nothing new is inferred here. */
export function composeVideoSummary(visual: VideoVisual, transcript: VideoTranscript | null) {
  const scene = (item: VideoScene) => `${item.onScreenText.length ? `"${item.onScreenText.join(" / ")}" ` : ""}(${[...item.objects.slice(0, 3), item.background].join(", ")})`;
  const parts = [`Video with ${visual.scenes.length} scene${visual.scenes.length === 1 ? "" : "s"}: ${visual.scenes.map(scene).join("; then ")}.`];
  if (transcript?.text) parts.push(`Spoken (transcribed): "${transcript.text}"`);
  else if (transcript) parts.push("No speech was transcribed.");
  const summary = clip(parts.join(" "), 1_200);
  const concepts = [...new Set([...visual.scenes.flatMap(item => item.onScreenText), ...visual.scenes.flatMap(item => item.objects), ...visual.occasions.map(item => item.suggestion)]
    .map(item => clip(item.toLowerCase(), 80)).filter(Boolean))].slice(0, 24);
  return { summary, concepts };
}

export function nextVideoStep(video: MemoryVideo): VideoStep | null {
  if (video.status === "ready" || video.status === "processing") return null;
  if (!video.visual) return video.visualAttempts < VIDEO_STEP_ATTEMPTS ? "visual" : null;
  return video.speechAttempts < VIDEO_STEP_ATTEMPTS ? "speech" : null;
}

function iso(value: unknown, what: string) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new VideoContractError(`Invalid ${what}.`); return value; }
/** Decodes an embedded memory_videos row (owner-readable) into the client-safe view. The storage path is never exposed. */
export function decodeMemoryVideo(value: unknown): MemoryVideo {
  const row = record(value, "video");
  if (!["pending", "processing", "ready", "failed"].includes(String(row.status))) throw new VideoContractError("Invalid video status.");
  const failure = row.failure_code === null ? null : String(row.failure_code) as VideoFailureCode;
  if (failure !== null && !failureCodes.has(failure)) throw new VideoContractError("Invalid failure code.");
  let visual: VideoVisual | null = null; let transcript: VideoTranscript | null = null;
  if (row.visual !== null) {
    const v = record(row.visual, "visual");
    exactKeys(v, ["model", "fps", "analyzedAt", "scenes", "observations", "interpretations", "gaps", "occasions"], "visual");
    if (v.model !== VIDEO_VISUAL_MODEL || !Array.isArray(v.scenes)) throw new VideoContractError("Invalid visual.");
    visual = { model: VIDEO_VISUAL_MODEL, fps: number(v.fps, 0.25, 4, "fps"), analyzedAt: iso(v.analyzedAt, "analysis time"),
      scenes: v.scenes.map(item => { const scene = record(item, "scene"); return { startSeconds: number(scene.startSeconds, 0, 60, "scene start"), endSeconds: number(scene.endSeconds, 0, 60, "scene end"),
        background: text(scene.background, 120, "background"), objects: strings(scene.objects, 8, 160, "objects"), onScreenText: strings(scene.onScreenText, 6, 120, "on-screen text"),
        motion: text(scene.motion, 200, "motion") }; }),
      observations: strings(v.observations, 20, 240, "observations"),
      interpretations: (Array.isArray(v.interpretations) ? v.interpretations : []).map(item => { const i = record(item, "interpretation"); return { claim: text(i.claim, 240, "claim"), basedOn: text(i.basedOn, 240, "basis") }; }),
      gaps: strings(v.gaps, 10, 240, "gaps"),
      occasions: (Array.isArray(v.occasions) ? v.occasions : []).map(item => { const o = record(item, "occasion"); if (o.basis !== "visible" && o.basis !== "inferred") throw new VideoContractError("Invalid occasion.");
        return { suggestion: text(o.suggestion, 120, "occasion"), basis: o.basis as "visible" | "inferred" }; }) };
  }
  if (row.transcript !== null) {
    const t = record(row.transcript, "transcript");
    if (t.model !== VIDEO_SPEECH_MODEL || typeof t.text !== "string" || !Array.isArray(t.turns)) throw new VideoContractError("Invalid transcript.");
    transcript = { model: VIDEO_SPEECH_MODEL, text: t.text, durationMs: number(t.durationMs, 0, 60_000, "duration"),
      turns: t.turns.map(item => { const turn = record(item, "turn"); return { startMs: number(turn.startMs, 0, 60_000, "turn"), endMs: number(turn.endMs, 0, 60_000, "turn"), text: text(turn.text, 1_000, "turn") }; }) };
  }
  const int = (input: unknown, min: number, max: number, what: string) => { const n = number(input, min, max, what); if (!Number.isInteger(n)) throw new VideoContractError(`Invalid ${what}.`); return n; };
  return { status: row.status as VideoStatus, durationMs: int(row.duration_ms, 1, 20_000, "duration"), sizeBytes: int(row.size_bytes, 1, VIDEO_MAX_BYTES, "size"),
    hasAudio: row.has_audio === true, width: row.width === null ? null : int(row.width, 1, 8192, "width"), height: row.height === null ? null : int(row.height, 1, 8192, "height"),
    consentAt: iso(row.consent_at, "consent time"), failureCode: failure, visualAttempts: int(row.visual_attempts, 0, 2, "attempts"), speechAttempts: int(row.speech_attempts, 0, 2, "attempts"),
    visual, transcript, summary: row.summary === null ? null : text(row.summary, 1_200, "summary"),
    concepts: Array.isArray(row.concepts) ? strings(row.concepts, 24, 80, "concepts") : [], analyzedAt: row.analyzed_at === null ? null : iso(row.analyzed_at, "analysis time") };
}
/** Columns of memory_videos the owner may read through the embedded select (no storage path). */
export const memoryVideoColumns = "status,duration_ms,size_bytes,has_audio,width,height,consent_at,failure_code,visual_attempts,speech_attempts,visual,transcript,summary,concepts,analyzed_at";
