import "server-only";
// Server-side media checks with ffprobe/ffmpeg. The file's real container, streams and duration decide acceptance, never the
// filename or the browser-supplied MIME type. Temporary files are private, uniquely named and always removed.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_MS, VideoContractError } from "./contracts.ts";

export type MediaTools = { ffprobe: string; ffmpeg: string };
export type ProbedVideo = { durationMs: number; width: number | null; height: number | null; hasAudio: boolean };
/** ffmpeg/ffprobe are not installed or not runnable here: report it instead of pretending media checks or transcription work. */
export class MediaToolUnavailable extends Error {}

export function mediaTools(env: Record<string, string | undefined> = process.env): MediaTools {
  return { ffprobe: env.FFPROBE_PATH?.trim() || "ffprobe", ffmpeg: env.FFMPEG_PATH?.trim() || "ffmpeg" };
}
function run(binary: string, args: string[], signal: AbortSignal, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(binary, args, { signal, timeout: timeoutMs, windowsHide: true, maxBuffer: 1_000_000 }, (error, stdout) => {
      if (error) { const code = (error as NodeJS.ErrnoException).code; reject(code === "ENOENT" || code === "EACCES" ? new MediaToolUnavailable(binary) : error); return; }
      resolve(stdout);
    });
  });
}
async function withTempFile<T>(bytes: Uint8Array, work: (path: string, dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "reibry-video-"));
  try { const path = join(dir, `${randomUUID()}.mp4`); await writeFile(path, bytes, { mode: 0o600 }); return await work(path, dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

/** Accepts only a real MP4 container with a video stream, at most VIDEO_MAX_BYTES and VIDEO_MAX_DURATION_MS. */
export async function probeVideo(bytes: Uint8Array, tools: MediaTools, signal: AbortSignal): Promise<ProbedVideo> {
  if (bytes.length < 12 || bytes.length > VIDEO_MAX_BYTES) throw new VideoContractError("size");
  // ISO base media files start with a box whose type at offset 4 is "ftyp".
  if (new TextDecoder().decode(bytes.subarray(4, 8)) !== "ftyp") throw new VideoContractError("container");
  return withTempFile(bytes, async path => {
    let output: string;
    try { output = await run(tools.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], signal, 15_000); }
    catch (error) { if (error instanceof MediaToolUnavailable) throw error; throw new VideoContractError("container"); }
    let probe: { format?: { format_name?: string; duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }> };
    try { probe = JSON.parse(output); } catch { throw new VideoContractError("container"); }
    const formats = String(probe.format?.format_name ?? "").split(",");
    const video = probe.streams?.find(stream => stream.codec_type === "video");
    if (!formats.includes("mp4") || !video) throw new VideoContractError("container");
    const seconds = Number(probe.format?.duration ?? video.duration);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new VideoContractError("container");
    const durationMs = Math.round(seconds * 1_000);
    if (durationMs > VIDEO_MAX_DURATION_MS) throw new VideoContractError("duration");
    const dimension = (value: unknown) => Number.isInteger(value) && (value as number) > 0 && (value as number) <= 8192 ? value as number : null;
    return { durationMs, width: dimension(video.width), height: dimension(video.height), hasAudio: !!probe.streams?.some(stream => stream.codec_type === "audio") };
  });
}

/** Mono 16-bit PCM WAV at 16 kHz: the only format Muse Voice Transcribe accepts. */
export async function extractSpeechWav(bytes: Uint8Array, tools: MediaTools, signal: AbortSignal): Promise<Uint8Array> {
  return withTempFile(bytes, async (path, dir) => {
    const out = join(dir, "speech.wav");
    await run(tools.ffmpeg, ["-v", "error", "-nostdin", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav", out], signal, 20_000);
    return new Uint8Array(await readFile(out));
  });
}
