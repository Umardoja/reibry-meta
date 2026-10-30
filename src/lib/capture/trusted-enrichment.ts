import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeMemory, type JsonValue, type Memory } from "../memory/contracts.ts";
import { MemoryRepositoryFailure } from "../memory/repository.ts";

/** Persists server-computed link enrichment for one Memory the verified user owns. Clients never reach this boundary. */
export type EnrichmentWriter = (memoryId: string, details: Record<string, JsonValue>, providerTitle: string | null) => Promise<Memory>;

export function createTrustedEnrichmentWriter(verifiedUserId: string, client: () => SupabaseClient): EnrichmentWriter {
  return async (memoryId, details, providerTitle) => {
    const { data, error } = await client().rpc("apply_trusted_link_enrichment", { p_user_id: verifiedUserId, p_memory_id: memoryId, p_details: details, p_title: providerTitle });
    if (error) throw new MemoryRepositoryFailure(error.code === "P0002" ? "NOT_FOUND" : "STORAGE_UNAVAILABLE");
    const row = Array.isArray(data) ? data[0] : data;
    try { return decodeMemory(row); } catch { throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE"); }
  };
}
