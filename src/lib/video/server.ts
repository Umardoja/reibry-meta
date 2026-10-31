import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthCookies } from "../auth/server.ts";
import { canonicalOrigin } from "../auth/origin.ts";
import { AuthFailure, missingSession, providerFailure } from "../auth/policy.ts";
import { decodeMemory, serializeMemory } from "../memory/contracts.ts";
import { MemoryRepositoryFailure } from "../memory/repository.ts";
import { createSupabaseMemoryRepository } from "../memory/supabase-repository.ts";
import { cookieJar, isAuthCookie } from "../supabase/cookies.ts";
import { createUserSupabaseClient } from "../supabase/server.ts";
import { createTrustedVideoClient } from "../supabase/trusted-server.ts";
import { VIDEO_BUCKET } from "./contracts.ts";
import { removeVideoObject } from "./storage.ts";
import { handleVideoAnalysisRequest, handleVideoUploadRequest, videoPrivateHeaders, type VideoContext } from "./handler.ts";
import { extractSpeechWav, MediaToolUnavailable, mediaTools, probeVideo } from "./media.ts";
import { analyzeVideoVisual, transcribeSpeech } from "./providers.ts";
import { VideoStepFailure, VideoStepRefused, type VideoAnalyzers, type VideoStore } from "./service.ts";

// Trusted RPC errors: P0002 = not this user's video; PT409 = running or already analysed; PT400 = step unavailable (order or retry cap).
function rpcFailure(error: { code?: string; message?: string }): never {
  if (error.code === "P0002") throw new MemoryRepositoryFailure("NOT_FOUND");
  if (error.code === "PT409") throw new VideoStepRefused(/already analysed/i.test(error.message ?? "") ? "already-analysed" : "busy");
  if (error.code === "PT400") throw new VideoStepRefused("unavailable");
  throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
}
/** Bound to the verified user. Ownership is proven through the owner's own session (memory_videos RLS); the bucket has no client policies,
 *  so Storage upload/download/remove use the server key, only for paths inside the verified user's folder. */
function supabaseVideoStore(userId: string, owner: SupabaseClient, trusted: () => SupabaseClient): VideoStore {
  const call = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await trusted().rpc(fn, { p_user_id: userId, ...args }); if (error) rpcFailure(error); return data; };
  return {
    async upload(path, bytes) {
      if (!path.startsWith(`${userId}/`)) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
      const { error } = await trusted().storage.from(VIDEO_BUCKET).upload(path, new Blob([new Uint8Array(bytes)], { type: "video/mp4" }), { contentType: "video/mp4", upsert: false });
      if (!error) return true;
      const status = String((error as { statusCode?: string | number }).statusCode ?? (error as { status?: number }).status ?? "");
      if (status === "409" || /already exists|duplicate/i.test(error.message)) return false;
      throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
    },
    async removeUploaded(path) { if (path.startsWith(`${userId}/`)) await removeVideoObject(trusted(), path); },
    async createMemory(input) {
      const data = await call("create_trusted_video_memory", { p_title: input.title, p_note: input.note, p_dedupe_key: input.dedupeKey, p_storage_path: input.path,
        p_size_bytes: input.sizeBytes, p_duration_ms: input.durationMs, p_width: input.width, p_height: input.height, p_has_audio: input.hasAudio, p_consented: true });
      const row = Array.isArray(data) ? data[0] : data;
      try { return serializeMemory(decodeMemory(row)); } catch { throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); }
    },
    async ownedPath(memoryId) {
      const { data, error } = await owner.from("memory_videos").select("storage_path").eq("user_id", userId).eq("memory_id", memoryId).maybeSingle();
      if (error) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); return data?.storage_path ?? null;
    },
    async download(path) {
      if (!path.startsWith(`${userId}/`)) throw new MemoryRepositoryFailure("NOT_FOUND");
      const { data, error } = await trusted().storage.from(VIDEO_BUCKET).download(path);
      if (error || !data) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); return new Uint8Array(await data.arrayBuffer());
    },
    async beginStep(memoryId, step) { await call("begin_video_analysis_step", { p_memory_id: memoryId, p_step: step }); },
    async recordVisual(memoryId, visual) { await call("record_video_visual", { p_memory_id: memoryId, p_visual: visual }); },
    async recordSpeech(memoryId, transcript, summary, concepts) { await call("record_video_speech", { p_memory_id: memoryId, p_transcript: transcript, p_summary: summary, p_concepts: concepts }); },
    async failStep(memoryId, step, code) { await call("fail_video_analysis_step", { p_memory_id: memoryId, p_step: step, p_code: code }); },
  };
}
function analyzers(signal: AbortSignal): VideoAnalyzers {
  const tools = mediaTools(); const dependencies = { env: process.env, fetch };
  return {
    probe: bytes => probeVideo(bytes, tools, signal),
    visual: bytes => analyzeVideoVisual(bytes, signal, dependencies),
    extractSpeech: async bytes => { try { return await extractSpeechWav(bytes, tools, signal); } catch (error) { throw new VideoStepFailure(error instanceof MediaToolUnavailable ? "not-configured" : "audio-extraction-failed"); } },
    transcribe: wav => transcribeSpeech(wav, signal, dependencies),
  };
}

async function route(request: Request, handle: (origin: string, factory: (signal: AbortSignal) => Promise<VideoContext>) => Promise<{ status: number; data: unknown; error: unknown }>) {
  const incoming = (await cookies()).getAll(); const jar = cookieJar(incoming);
  let origin: string;
  try { origin = canonicalOrigin(request, process.env.AUTH_SITE_URL); }
  catch { return NextResponse.json({ data: null, error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, { status: 503, headers: videoPrivateHeaders }); }
  const result = await handle(origin, async signal => {
    if (!incoming.some(cookie => isAuthCookie(cookie.name))) throw new AuthFailure("AUTH_REQUIRED");
    const { client } = createUserSupabaseClient(jar, signal, origin); const { data, error } = await client.auth.getUser();
    if (error) { if (missingSession(error)) throw new AuthFailure("AUTH_REQUIRED"); throw providerFailure(error); }
    if (!data.user?.id) throw new AuthFailure("AUTH_REQUIRED");
    const userId = data.user.id;
    return { userId, repository: createSupabaseMemoryRepository(client, userId), store: supabaseVideoStore(userId, client, () => createTrustedVideoClient(signal)), analyzers: analyzers(signal) };
  });
  // Sanitized server log for a failed analysis step: failure code and diagnostic only (no IDs, content or provider bodies).
  const failed = (result.data as { failure?: { code: string; diagnostic: string | null } | null } | null)?.failure;
  if (failed) console.warn(`[video-analysis] step failed: code=${failed.code} diagnostic=${failed.diagnostic ?? "none"}`);
  const response = NextResponse.json({ data: result.data, error: result.error }, { status: result.status, headers: videoPrivateHeaders });
  return applyAuthCookies(response, result.status === 401 ? jar.clear() : result.error ? [] : jar.writes(), origin.startsWith("https:"));
}
export function videoUploadApiRoute(request: Request) { return route(request, (origin, factory) => handleVideoUploadRequest(request, factory, origin)); }
export function videoAnalysisApiRoute(request: Request, id: string) { return route(request, (origin, factory) => handleVideoAnalysisRequest(request, id, factory, origin)); }
