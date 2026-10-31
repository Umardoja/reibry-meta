// Stage 12I-2B video Memory flows. Every dependency is injected so the flow is testable without network, Supabase or ffmpeg.
// Save and analysis are separate requests: saving never waits for Muse, and a failed analysis never removes the saved video.
import { createHash } from "node:crypto";
import type { MetaUsage } from "../ai/meta/contracts.ts";
import type { Memory } from "../memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { composeVideoSummary, VideoContractError, type MemoryVideo, type VideoFailureCode, type VideoStep, type VideoTranscript, type VideoVisual } from "./contracts.ts";
import type { ProbedVideo } from "./media.ts";

/** Trusted, verified-user-bound persistence (service_role RPCs + Storage upload) and the owner's own Storage reads. */
export type VideoStore = {
  /** Uploads with the server key after validation; returns false when the identical (content-addressed) object already exists. */
  upload(path: string, bytes: Uint8Array): Promise<boolean>;
  removeUploaded(path: string): Promise<void>;
  createMemory(input: { title: string; note: string | null; dedupeKey: string; path: string; sizeBytes: number } & ProbedVideo): Promise<Memory>;
  /** Owner-scoped: the storage path of the owner's own video (RLS), or null. */
  ownedPath(memoryId: string): Promise<string | null>;
  /** Owner-scoped Storage download through the owner read policy. */
  download(path: string): Promise<Uint8Array>;
  beginStep(memoryId: string, step: VideoStep): Promise<void>;
  recordVisual(memoryId: string, visual: VideoVisual): Promise<void>;
  recordSpeech(memoryId: string, transcript: VideoTranscript | null, summary: string, concepts: string[]): Promise<void>;
  failStep(memoryId: string, step: VideoStep, code: VideoFailureCode): Promise<void>;
};
export type VideoAnalyzers = {
  probe(bytes: Uint8Array): Promise<ProbedVideo>;
  /** normalizations: sanitized names of safe normalizations applied to a valid but minimal answer (see parseVisualAnalysisDetailed). */
  visual(bytes: Uint8Array): Promise<{ visual: VideoVisual; usage: MetaUsage | null; normalizations?: string[] }>;
  extractSpeech(bytes: Uint8Array): Promise<Uint8Array>;
  transcribe(wav: Uint8Array): Promise<VideoTranscript>;
};
/** Thrown by a store when another step of this user is running (PT409) or the step is unavailable (retry cap, wrong order, PT400). */
export class VideoStepRefused extends Error { reason: "busy" | "unavailable" | "already-analysed"; constructor(reason: "busy" | "unavailable" | "already-analysed") { super(reason); this.reason = reason; } }
/** A failure that the analysis step records as `failed` with this code, keeping the saved video. */
export class VideoStepFailure extends Error { code: VideoFailureCode; constructor(code: VideoFailureCode) { super(code); this.code = code; } }

export type VideoUpload = { bytes: Uint8Array; title: string | null; note: string | null; consent: boolean };
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

export function videoTitle(input: string | null, durationMs: number) {
  const title = input?.trim().replace(/\s+/g, " ").slice(0, 200);
  return title || `Video · ${Math.max(1, Math.round(durationMs / 1_000))} s`;
}

export async function saveVideo(upload: VideoUpload, userId: string, repository: MemoryRepository, store: VideoStore, analyzers: Pick<VideoAnalyzers, "probe">) {
  if (!upload.consent) throw new VideoContractError("consent");
  const probed = await analyzers.probe(upload.bytes);
  const hash = sha256(upload.bytes);
  const path = `${userId}/${hash}.mp4`;
  const created = await store.upload(path, upload.bytes);
  let memory: Memory;
  try {
    memory = await store.createMemory({ title: videoTitle(upload.title, probed.durationMs), note: upload.note?.trim() ? upload.note.trim().slice(0, 2_000) : null,
      dedupeKey: sha256(`video\0${hash}`), path, sizeBytes: upload.bytes.length, ...probed });
  } catch (error) {
    // Never leave an uploaded object that no Memory points to.
    if (created) await store.removeUploaded(path).catch(() => {});
    throw error;
  }
  // The object name is the content hash in the user's folder, and deleting a Memory deletes its object first, so an
  // already-present object means this user already saved this exact file (the trusted writer returned that same Memory).
  return { memory: await repository.read(memory.id), duplicate: !created };
}

/** Runs ONE analysis step for the owner's own video. The visual step calls Muse Spark; the speech step extracts audio and calls Voice Transcribe. */
export async function runVideoStep(memoryId: string, step: VideoStep, repository: MemoryRepository, store: VideoStore, analyzers: VideoAnalyzers) {
  const memory = await repository.read(memoryId);
  if (memory.sourceType !== "video" || !memory.video) throw new MemoryRepositoryFailure("NOT_FOUND");
  const path = await store.ownedPath(memoryId);
  if (!path) throw new MemoryRepositoryFailure("NOT_FOUND");
  await store.beginStep(memoryId, step);
  let usage: MetaUsage | null = null; let normalizations: string[] = []; let failure: { code: VideoFailureCode; diagnostic: string | null } | null = null;
  try {
    let bytes: Uint8Array;
    try { bytes = await store.download(path); } catch { throw new VideoStepFailure("media-unavailable"); }
    if (step === "visual") {
      const result = await analyzers.visual(bytes); usage = result.usage; normalizations = result.normalizations ?? [];
      await store.recordVisual(memoryId, result.visual);
    } else {
      const visual = memory.video.visual;
      if (!visual) throw new VideoStepFailure("invalid-provider-output");
      let transcript: VideoTranscript | null = null;
      if (memory.video.hasAudio) {
        let wav: Uint8Array;
        try { wav = await analyzers.extractSpeech(bytes); } catch (error) { if (error instanceof VideoStepFailure) throw error; throw new VideoStepFailure("audio-extraction-failed"); }
        transcript = await analyzers.transcribe(wav);
      }
      const { summary, concepts } = composeVideoSummary(visual, transcript);
      await store.recordSpeech(memoryId, transcript, summary, concepts);
    }
  } catch (error) {
    const code = error instanceof VideoStepFailure ? error.code : error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string" &&
      ["provider-timeout", "provider-unavailable", "provider-rejected", "invalid-provider-output", "media-unavailable", "audio-extraction-failed", "not-configured"].includes((error as { code: string }).code)
      ? (error as { code: VideoFailureCode }).code : null;
    // Record the failure (the saved video and any completed visual step stay), then report the honest state.
    await store.failStep(memoryId, step, code ?? "provider-unavailable");
    if (!code) throw error;
    // Sanitized reason only (e.g. "http-503", "schema:scene end"); provider content is never kept.
    const diagnostic = (error as { diagnostic?: unknown }).diagnostic;
    failure = { code, diagnostic: typeof diagnostic === "string" ? diagnostic : null };
    // A rejected answer is still billed: keep its token usage when the provider reported it.
    const failedUsage = (error as { usage?: MetaUsage | null }).usage; if (failedUsage) usage = failedUsage;
  }
  return { memory: await repository.read(memoryId), usage, normalizations, failure };
}

export type { MemoryVideo };
