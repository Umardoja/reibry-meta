// Stage 12I-2B HTTP handlers: save a user's own short MP4 (multipart), then run one analysis step per request.
import { AuthFailure, bounded, errorCode as authErrorCode, messages as authMessages } from "../auth/policy.ts";
import { memoryId } from "../memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { VIDEO_MAX_BYTES, VideoContractError, type VideoStep } from "./contracts.ts";
import { MediaToolUnavailable } from "./media.ts";
import { runVideoStep, saveVideo, VideoStepRefused, type VideoAnalyzers, type VideoStore } from "./service.ts";

export type VideoContext = { userId: string; repository: MemoryRepository; store: VideoStore; analyzers: VideoAnalyzers };
export type VideoContextFactory = (signal: AbortSignal) => Promise<VideoContext>;
type FailureCode = "VALIDATION_ERROR" | "CONSENT_REQUIRED" | "VIDEO_REJECTED" | "VIDEO_TOO_LARGE" | "VIDEO_TOO_LONG" | "NOT_FOUND" | "VIDEO_BUSY" |
  "VIDEO_STEP_UNAVAILABLE" | "VIDEO_ALREADY_ANALYSED" | "VIDEO_PROCESSING_UNAVAILABLE" | "AUTH_REQUIRED" | "AUTH_NOT_CONFIGURED" | "AUTH_TIMEOUT" | "STORAGE_UNAVAILABLE";
export type VideoResponse = { status: number; data: unknown; error: { code: FailureCode; message: string } | null };
export const videoPrivateHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
const messages: Record<FailureCode, [number, string]> = {
  VALIDATION_ERROR: [400, "Check the video details and try again."],
  CONSENT_REQUIRED: [400, "Confirm the video is yours, or that you have permission to save and analyse it."],
  VIDEO_REJECTED: [400, "That file isn't a playable MP4 video. Choose an MP4 up to 20 seconds and 20 MB."],
  VIDEO_TOO_LARGE: [413, "That video is larger than 20 MB. Choose a shorter or smaller MP4."],
  VIDEO_TOO_LONG: [400, "That video is longer than 20 seconds. Choose a clip of 20 seconds or less."],
  NOT_FOUND: [404, "Video Memory not found."],
  VIDEO_BUSY: [409, "Another video is being analysed. Try again when it finishes."],
  VIDEO_STEP_UNAVAILABLE: [409, "This video can't be analysed again: the retry limit was reached."],
  VIDEO_ALREADY_ANALYSED: [409, "This video has already been analysed."],
  VIDEO_PROCESSING_UNAVAILABLE: [503, "Video processing isn't available on this server right now. Your saved video is safe."],
  AUTH_REQUIRED: [401, "Sign in to save a video."], AUTH_NOT_CONFIGURED: [503, authMessages.AUTH_NOT_CONFIGURED], AUTH_TIMEOUT: [504, authMessages.AUTH_TIMEOUT],
  STORAGE_UNAVAILABLE: [503, "The video could not be saved because storage is unavailable."],
};
function failure(code: FailureCode, status = messages[code][0]): VideoResponse { return { status, data: null, error: { code, message: messages[code][1] } }; }
function mapped(error: unknown): FailureCode {
  if (error instanceof VideoContractError) return error.message === "consent" ? "CONSENT_REQUIRED" : error.message === "size" ? "VIDEO_TOO_LARGE" : error.message === "duration" ? "VIDEO_TOO_LONG" :
    error.message === "container" ? "VIDEO_REJECTED" : "VALIDATION_ERROR";
  if (error instanceof MediaToolUnavailable) return "VIDEO_PROCESSING_UNAVAILABLE";
  if (error instanceof VideoStepRefused) return error.reason === "busy" ? "VIDEO_BUSY" : error.reason === "already-analysed" ? "VIDEO_ALREADY_ANALYSED" : "VIDEO_STEP_UNAVAILABLE";
  if (error instanceof MemoryRepositoryFailure) return error.code === "NOT_FOUND" ? "NOT_FOUND" : "STORAGE_UNAVAILABLE";
  if (error instanceof AuthFailure) { const code = authErrorCode(error); return ["AUTH_REQUIRED", "AUTH_NOT_CONFIGURED", "AUTH_TIMEOUT"].includes(code) ? code as FailureCode : "STORAGE_UNAVAILABLE"; }
  return "STORAGE_UNAVAILABLE";
}
function sameOrigin(request: Request, expectedOrigin: string) { return request.headers.get("origin") === expectedOrigin && request.headers.get("sec-fetch-site") !== "cross-site"; }

/** Reads at most VIDEO_MAX_BYTES + 64 KB of multipart body before parsing, whatever Content-Length claims. */
async function readMultipart(request: Request, signal: AbortSignal) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data") || !request.body) throw new VideoContractError("form");
  const limit = VIDEO_MAX_BYTES + 65_536; const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new VideoContractError("size");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { cancel(); throw new VideoContractError("size"); } chunks.push(value); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let form: FormData; try { form = await new Response(bytes, { headers: { "content-type": type } }).formData(); } catch { throw new VideoContractError("form"); }
  const allowed = new Set(["video", "title", "note", "consent"]);
  if ([...form.keys()].some(key => !allowed.has(key))) throw new VideoContractError("form");
  const file = form.get("video"); const title = form.get("title"); const note = form.get("note");
  if (!(file instanceof Blob) || !file.size) throw new VideoContractError("container");
  if (file.size > VIDEO_MAX_BYTES) throw new VideoContractError("size");
  if ((title !== null && (typeof title !== "string" || title.length > 200)) || (note !== null && (typeof note !== "string" || note.length > 2_000))) throw new VideoContractError("form");
  return { bytes: new Uint8Array(await file.arrayBuffer()), title: typeof title === "string" ? title : null, note: typeof note === "string" ? note : null, consent: form.get("consent") === "yes" };
}

export async function handleVideoUploadRequest(request: Request, factory: VideoContextFactory, expectedOrigin = new URL(request.url).origin, timeout = 45_000): Promise<VideoResponse> {
  if (request.method !== "POST") return failure("VALIDATION_ERROR", 405);
  if (!sameOrigin(request, expectedOrigin)) return failure("VALIDATION_ERROR", 403);
  try {
    return await bounded(async signal => {
      const upload = await readMultipart(request, signal);
      if (!upload.consent) throw new VideoContractError("consent");
      const context = await factory(signal);
      if (context.repository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
      const result = await saveVideo(upload, context.userId, context.repository, context.store, context.analyzers);
      return { status: result.duplicate ? 200 : 201, data: result, error: null };
    }, timeout);
  } catch (error) { return failure(mapped(error)); }
}

/** One step per request ({ "step": "visual" | "speech" }), so the page can show real progress and a failed step resumes without repeating the other. */
export async function handleVideoAnalysisRequest(request: Request, id: string, factory: VideoContextFactory, expectedOrigin = new URL(request.url).origin, timeout = 75_000): Promise<VideoResponse> {
  if (request.method !== "POST") return failure("VALIDATION_ERROR", 405);
  if (!sameOrigin(request, expectedOrigin)) return failure("VALIDATION_ERROR", 403);
  try {
    return await bounded(async signal => {
      let itemId: string; try { itemId = memoryId(id); } catch { throw new VideoContractError("id"); }
      let step: VideoStep;
      if (Number(request.headers.get("content-length") ?? 0) > 1_024) throw new VideoContractError("step");
      try { const body = await request.json() as Record<string, unknown>; if (Object.keys(body).length !== 1 || (body.step !== "visual" && body.step !== "speech")) throw new Error(); step = body.step; }
      catch { throw new VideoContractError("step"); }
      const context = await factory(signal);
      if (context.repository.ownerId !== context.userId) throw new AuthFailure("AUTH_REQUIRED");
      return { status: 200, data: await runVideoStep(itemId, step, context.repository, context.store, context.analyzers), error: null };
    }, timeout);
  } catch (error) { return failure(mapped(error)); }
}
