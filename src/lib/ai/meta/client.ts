import "server-only";
import { META_ENDPOINT, META_MODEL, META_REQUEST_BYTES_MAX, META_RESPONSE_BYTES_MAX, type MetaUsage } from "./contracts.ts";

export type MetaFailureCode = "META_NOT_CONFIGURED" | "META_TIMEOUT" | "META_AUTH" | "META_BILLING" | "META_ACCESS" | "META_RATE_LIMIT" | "META_UNAVAILABLE" | "META_INVALID_RESPONSE";
export type MetaResponseDiagnostic = "envelope_invalid" | "response_incomplete" | "response_refusal" | "output_missing" | "output_too_large" | "invalid_json" | "schema_mismatch" | "citation_mismatch" | "grounding_violation" | "usage_invalid";
export class MetaClientError extends Error {
  code: MetaFailureCode;
  diagnostic: MetaResponseDiagnostic | null;
  constructor(code: MetaFailureCode, diagnostic: MetaResponseDiagnostic | null = null) { super(code); this.code = code; this.diagnostic = diagnostic; }
}
export type MetaClientDependencies = { env: Record<string, string | undefined>; fetch: typeof fetch; sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>; random: () => number; maxAttempts?: 1 | 2 };
export type MetaRawResult = { body: unknown; usage: MetaUsage; latencyMs: number };

export function metaConfig(env: Record<string, string | undefined>) {
  const key = env.MODEL_API_KEY;
  if (!key || !/^LLM_[^_\s]+_.{8,}$/.test(key)) throw new MetaClientError("META_NOT_CONFIGURED");
  if (env.META_RATE_LIMIT_MODE !== "in-memory") throw new MetaClientError("META_NOT_CONFIGURED");
  return { key, endpoint: META_ENDPOINT, model: META_MODEL };
}
function defaultSleep(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}
export const defaultMetaDependencies: MetaClientDependencies = { env: process.env, fetch, sleep: defaultSleep, random: Math.random };

async function readBounded(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > META_RESPONSE_BYTES_MAX) throw new MetaClientError("META_INVALID_RESPONSE", "output_too_large");
  if (!response.body) throw new MetaClientError("META_INVALID_RESPONSE", "envelope_invalid");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > META_RESPONSE_BYTES_MAX) { void reader.cancel(); throw new MetaClientError("META_INVALID_RESPONSE", "output_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MetaClientError("META_INVALID_RESPONSE", "envelope_invalid"); }
}
function mappedStatus(status: number): MetaFailureCode {
  if (status === 401) return "META_AUTH"; if (status === 402) return "META_BILLING"; if (status === 403 || status === 404) return "META_ACCESS";
  if (status === 429) return "META_RATE_LIMIT"; if ([500, 503].includes(status)) return "META_UNAVAILABLE"; return "META_INVALID_RESPONSE";
}
function retryDelay(response: Response, attempt: number, random: () => number) {
  const header = response.headers.get("retry-after"); let milliseconds = 0;
  if (header && /^\d+(?:\.\d+)?$/.test(header)) milliseconds = Number(header) * 1_000;
  else if (header) milliseconds = Math.max(0, Date.parse(header) - Date.now());
  if (milliseconds > 2_000) return null;
  return Math.max(milliseconds, 250 * 2 ** attempt + Math.floor(random() * 150));
}
function usage(value: unknown): MetaUsage {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const numbers = [item.input_tokens, item.output_tokens, item.total_tokens];
  if (numbers.some(number => !Number.isSafeInteger(number) || (number as number) < 0)) throw new MetaClientError("META_INVALID_RESPONSE", "usage_invalid");
  return { inputTokens: item.input_tokens as number, outputTokens: item.output_tokens as number, totalTokens: item.total_tokens as number };
}

export async function callMetaResponses(payload: Record<string, unknown>, signal: AbortSignal,
  dependencies: MetaClientDependencies = defaultMetaDependencies, timeoutMs = 12_000): Promise<MetaRawResult> {
  const config = metaConfig(dependencies.env); const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).length > META_REQUEST_BYTES_MAX) throw new MetaClientError("META_INVALID_RESPONSE");
  if (signal.aborted) throw new MetaClientError("META_TIMEOUT");
  const started = Date.now();
  const maxAttempts = dependencies.maxAttempts ?? 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController(); const abort = () => controller.abort(); signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await dependencies.fetch(config.endpoint, { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", Accept: "application/json" }, body: serialized });
      if (!response.ok) {
        if ([429, 500, 503].includes(response.status) && attempt + 1 < maxAttempts) { const delay = retryDelay(response, attempt, dependencies.random);
          try { await response.body?.cancel(); } catch { /* Ignore an error-body disposal failure. */ }
          if (delay !== null) { await dependencies.sleep(delay, signal); continue; } }
        try { await response.body?.cancel(); } catch { /* Never surface or log upstream error bodies. */ }
        throw new MetaClientError(mappedStatus(response.status));
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new MetaClientError("META_INVALID_RESPONSE", "envelope_invalid");
      const body = await readBounded(response);
      const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
      if (record.status === "incomplete" || record.incomplete_details) throw new MetaClientError("META_INVALID_RESPONSE", "response_incomplete");
      if (record.status !== "completed" || record.store !== false || record.model !== config.model) throw new MetaClientError("META_INVALID_RESPONSE", "envelope_invalid");
      const counted = usage(record.usage); const configuredOutput = payload.max_output_tokens;
      if (!Number.isSafeInteger(configuredOutput) || (configuredOutput as number) < 16 || counted.outputTokens > (configuredOutput as number)) throw new MetaClientError("META_INVALID_RESPONSE", "usage_invalid");
      return { body, usage: counted, latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof MetaClientError) throw error;
      if (controller.signal.aborted || signal.aborted) throw new MetaClientError("META_TIMEOUT");
      throw new MetaClientError("META_UNAVAILABLE");
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  }
  throw new MetaClientError("META_UNAVAILABLE");
}
