// Test-only VideoStore mirroring supabase/migrations/20261031000000_video_memories.sql: owner checks (P0002), step order and the
// two-attempt cap (PT400), one running step per user and "already analysed" (PT409), failures keeping the video, and owner-only objects.
import { serializeMemory, type Memory } from "../../src/lib/memory/contracts.ts";
import { MemoryRepositoryFailure } from "../../src/lib/memory/repository.ts";
import { VIDEO_STEP_ATTEMPTS, type MemoryVideo } from "../../src/lib/video/contracts.ts";
import { VideoStepRefused, type VideoStore } from "../../src/lib/video/service.ts";
import type { MemoryTestState } from "./in-memory-memory-repository.ts";

export type VideoObjects = Map<string, Uint8Array>;
export type VideoPaths = Map<string, string>;
export function createInMemoryVideoStore(userId: string, state: MemoryTestState, objects: VideoObjects, paths: VideoPaths,
  options: { now?: () => string; failCreate?: boolean } = {}): VideoStore {
  const now = options.now ?? (() => "2026-10-31T08:00:00.000Z");
  const owned = (memoryId: string) => { const memory = state.get(memoryId); if (!memory || memory.userId !== userId || !memory.video) throw new MemoryRepositoryFailure("NOT_FOUND"); return memory; };
  const put = (memory: Memory, video: Partial<MemoryVideo>, status?: Memory["analysisStatus"]) =>
    state.set(memory.id, { ...memory, ...(status ? { analysisStatus: status } : {}), video: { ...memory.video!, ...video } });
  const processing = new Map<string, string>(); // memoryId -> step
  return {
    async upload(path, bytes) { if (!path.startsWith(`${userId}/`)) throw new Error("foreign folder"); if (objects.has(path)) return false; objects.set(path, bytes); return true; },
    async removeUploaded(path) { objects.delete(path); },
    async createMemory(input) {
      if (options.failCreate) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
      const existing = [...state.values()].find(memory => memory.userId === userId && memory.metadata.dedupeKey === input.dedupeKey);
      if (existing) return serializeMemory(existing);
      const id = `70000000-0000-4000-8000-${String(state.size + 1).padStart(12, "0")}`;
      const memory: Memory = { id, userId, title: input.title, sourceType: "video", sourceUrl: null, rawText: input.note, analysisStatus: "processing",
        metadata: { capture: "video", dedupeKey: input.dedupeKey }, createdAt: now(), updatedAt: now(),
        video: { status: "pending", durationMs: input.durationMs, sizeBytes: input.sizeBytes, hasAudio: input.hasAudio, width: input.width, height: input.height, consentAt: now(),
          failureCode: null, visualAttempts: 0, speechAttempts: 0, visual: null, transcript: null, summary: null, concepts: [], analyzedAt: null } };
      state.set(id, memory); paths.set(id, input.path); return serializeMemory(memory);
    },
    async ownedPath(memoryId) { const memory = state.get(memoryId); return memory && memory.userId === userId ? paths.get(memoryId) ?? null : null; },
    async download(path) { if (!path.startsWith(`${userId}/`) || !objects.has(path)) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); return objects.get(path)!; },
    async beginStep(memoryId, step) {
      const memory = owned(memoryId); const video = memory.video!;
      if (video.status === "ready") throw new VideoStepRefused("already-analysed");
      if ([...processing.keys()].some(id => state.get(id)?.userId === userId)) throw new VideoStepRefused("busy");
      if (step === "visual" && (video.visual || video.visualAttempts >= VIDEO_STEP_ATTEMPTS)) throw new VideoStepRefused("unavailable");
      if (step === "speech" && (!video.visual || video.speechAttempts >= VIDEO_STEP_ATTEMPTS)) throw new VideoStepRefused("unavailable");
      processing.set(memoryId, step);
      put(memory, { status: "processing", failureCode: null, visualAttempts: video.visualAttempts + (step === "visual" ? 1 : 0), speechAttempts: video.speechAttempts + (step === "speech" ? 1 : 0) });
    },
    async recordVisual(memoryId, visual) {
      const memory = owned(memoryId); if (processing.get(memoryId) !== "visual") throw new VideoStepRefused("busy");
      processing.delete(memoryId); put(memory, { visual, status: "pending" });
    },
    async recordSpeech(memoryId, transcript, summary, concepts) {
      const memory = owned(memoryId); if (processing.get(memoryId) !== "speech") throw new VideoStepRefused("busy");
      if (memory.video!.hasAudio !== (transcript !== null)) throw new VideoStepRefused("unavailable");
      processing.delete(memoryId); put(memory, { transcript, summary, concepts, status: "ready", analyzedAt: now() }, "complete");
    },
    async failStep(memoryId, step, code) {
      const memory = owned(memoryId); if (processing.get(memoryId) !== step) throw new VideoStepRefused("busy");
      processing.delete(memoryId); put(memory, { status: "failed", failureCode: code }, "failed");
    },
  };
}
