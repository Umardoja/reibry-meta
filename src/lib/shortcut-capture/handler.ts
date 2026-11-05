import { bounded } from "../auth/policy.ts";
import { CaptureContractError } from "../capture/contracts.ts";
import { capture } from "../capture/service.ts";
import { parsePublicLink } from "../capture/url-policy.ts";
import type { Memory, NewMemory } from "../memory/contracts.ts";
import { MemoryRepositoryFailure } from "../memory/repository.ts";
import { parseShortcutCapture, SHORTCUT_REQUEST_MAX_BYTES, ShortcutCaptureContractError } from "./contracts.ts";
import { ShortcutCaptureFailure } from "./repository.ts";

export const shortcutCaptureHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", Pragma: "no-cache", Vary: "X-REIBRY-CAPTURE-KEY" };
type Code = "VALIDATION_ERROR" | "AUTH_REQUIRED" | "RATE_LIMITED" | "STORAGE_UNAVAILABLE" | "SHORTCUT_CAPTURE_DISABLED";
export type ShortcutCaptureResult = { status: number; data: { status: "saved" | "already_saved"; memoryId: string } | null; error: { code: Code; message: string } | null };
const message: Record<Code, string> = { VALIDATION_ERROR: "Use a supported public HTTPS link.", AUTH_REQUIRED: "This Shortcut is not authorized. Set it up again from REIBRY.", RATE_LIMITED: "This Shortcut is sending saves too quickly. Try again shortly.", STORAGE_UNAVAILABLE: "REIBRY could not save this link. Check Memories before retrying with the same request ID.", SHORTCUT_CAPTURE_DISABLED: "Shortcut saving is not enabled." };
const fail = (code: Code, status = code === "AUTH_REQUIRED" ? 401 : code === "RATE_LIMITED" ? 429 : code === "VALIDATION_ERROR" ? 400 : 503): ShortcutCaptureResult => ({ status, data: null, error: { code, message: message[code] } });
type Writer = { createUnique(input: NewMemory, key: string): Promise<{ memory: Memory; duplicate: boolean }> };

async function body(request: Request, signal: AbortSignal) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new ShortcutCaptureContractError("Use JSON.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener("abort", cancel, { once: true });
  try { while (true) { const next = await reader.read(); if (next.done) break; total += next.value.length; if (total > SHORTCUT_REQUEST_MAX_BYTES) { cancel(); throw new ShortcutCaptureContractError("Request is too large."); } chunks.push(next.value); }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ShortcutCaptureContractError("Use JSON."); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

export async function handleShortcutCapture(request: Request, options: { enabled: boolean; credential: string | null; write: (tokenHash: string, requestId: string, signal: AbortSignal) => Writer; hash: (credential: string) => string }, timeout = 8_000): Promise<ShortcutCaptureResult> {
  if (!options.enabled) return fail("SHORTCUT_CAPTURE_DISABLED");
  if (request.method !== "POST") return fail("VALIDATION_ERROR", 405);
  const credential = options.credential; if (!credential) return fail("AUTH_REQUIRED");
  try { return await bounded(async signal => {
    const input = parseShortcutCapture(await body(request, signal));
    parsePublicLink(input.url); // Validate before any privileged storage call; no URL is fetched.
    const saved = await capture({ sourceType: "link", content: input.url }, options.write(options.hash(credential), input.requestId, signal));
    return { status: saved.duplicate ? 200 : 201, data: { status: saved.duplicate ? "already_saved" as const : "saved" as const, memoryId: saved.memory.id }, error: null };
  }, timeout); }
  catch (error) {
    if (error instanceof ShortcutCaptureFailure) return fail(error.code);
    if (error instanceof ShortcutCaptureContractError || error instanceof CaptureContractError) return fail("VALIDATION_ERROR");
    if (error instanceof MemoryRepositoryFailure) return fail("STORAGE_UNAVAILABLE");
    return fail("STORAGE_UNAVAILABLE");
  }
}
