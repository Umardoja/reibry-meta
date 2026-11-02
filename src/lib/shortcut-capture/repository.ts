import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeMemory, type Memory, type NewMemory } from "../memory/contracts.ts";
import { MemoryRepositoryFailure } from "../memory/repository.ts";
import type { ShortcutDevice } from "./contracts.ts";

export class ShortcutCaptureFailure extends Error {
  readonly code: "AUTH_REQUIRED" | "RATE_LIMITED" | "STORAGE_UNAVAILABLE";
  constructor(code: "AUTH_REQUIRED" | "RATE_LIMITED" | "STORAGE_UNAVAILABLE") { super(code); this.code = code; }
}
function row(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function device(value: unknown): ShortcutDevice {
  const item = row(value); if (!item || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.created_at !== "string" || typeof item.expires_at !== "string") throw new ShortcutCaptureFailure("STORAGE_UNAVAILABLE");
  return { id: item.id, name: item.name, createdAt: item.created_at, expiresAt: item.expires_at, revokedAt: typeof item.revoked_at === "string" ? item.revoked_at : null, lastUsedAt: typeof item.last_used_at === "string" ? item.last_used_at : null };
}
function failure(error: { code?: string } | null): never {
  if (error?.code === "P0002" || error?.code === "P0003") throw new ShortcutCaptureFailure("AUTH_REQUIRED");
  if (error?.code === "PT429") throw new ShortcutCaptureFailure("RATE_LIMITED");
  throw new ShortcutCaptureFailure("STORAGE_UNAVAILABLE");
}

/** User-scoped setup functions return descriptors, never a hash or plaintext credential. */
export function createShortcutDeviceRepository(client: SupabaseClient) {
  return {
    async list() { const { data, error } = await client.rpc("list_capture_devices"); if (error) return failure(error); return (Array.isArray(data) ? data : []).map(device); },
    async issue(input: { tokenHash: string; name: string; expiresAt: string }) {
      const { data, error } = await client.rpc("create_capture_device", { p_token_hash: input.tokenHash, p_name: input.name, p_expires_at: input.expiresAt });
      if (error || !data) return failure(error); return device(Array.isArray(data) ? data[0] : data);
    },
    async revoke(id: string) { const { data, error } = await client.rpc("revoke_capture_device", { p_device_id: id }); if (error || data !== true) return failure(error); },
  };
}

/** A deliberately tiny capability: the device endpoint cannot read, list, update, or delete owner data. */
export function createShortcutCaptureWriter(client: SupabaseClient, tokenHash: string, requestId: string) {
  return {
    async createUnique(input: NewMemory, dedupeKey: string): Promise<{ memory: Memory; duplicate: boolean }> {
      const { data, error } = await client.rpc("capture_from_device", { p_token_hash: tokenHash, p_request_id: requestId,
        p_source_url: input.sourceUrl, p_title: input.title, p_metadata: input.metadata, p_dedupe_key: dedupeKey });
      if (error || !data) return failure(error);
      const result = row(Array.isArray(data) ? data[0] : data);
      if (!result || typeof result.memory !== "object" || typeof result.duplicate !== "boolean") throw new ShortcutCaptureFailure("STORAGE_UNAVAILABLE");
      try { return { memory: decodeMemory(result.memory), duplicate: result.duplicate }; }
      catch { throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); }
    },
  };
}
