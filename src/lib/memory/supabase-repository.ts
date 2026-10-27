import "server-only";
// Adapted from original REIBRY data/supabase-store.ts. The client is non-elevated and user scoped.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeMemory, serializeMemory, type MemoryUpdate, type NewMemory, type NewTextMemory } from "./contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "./repository.ts";

const columns = "id,user_id,title,source_type,source_url,raw_text,analysis_status,metadata,created_at,updated_at";
function storage(error: unknown): never {
  if (error) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
  throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
}
function decode(value: unknown) {
  try { return serializeMemory(decodeMemory(value)); } catch { return storage(new Error("invalid-row")); }
}
export function createSupabaseMemoryRepository(client: SupabaseClient, ownerId: string): MemoryRepository {
  const insertMemory = (input: NewMemory, dedupeKey: string | null) => client.from("memories").insert({ user_id: ownerId,
    title: input.title, source_type: input.sourceType, source_url: input.sourceUrl, raw_text: input.rawText,
    analysis_status: input.analysisStatus, metadata: input.metadata, dedupe_key: dedupeKey });
  return {
    ownerId,
    async create(input: NewTextMemory) {
      const { data, error } = await client.from("memories").insert({ user_id: ownerId, title: input.title,
        source_type: "text", source_url: null, raw_text: input.rawText, analysis_status: "processing", metadata: {} })
        .select(columns).single();
      if (error || !data) return storage(error);
      return decode(data);
    },
    async createUnique(input, dedupeKey) {
      const { data, error } = await insertMemory(input, dedupeKey).select(columns).single();
      if (!error && data) return { memory: decode(data), duplicate: false };
      if (error?.code !== "23505") return storage(error);
      // The unique index includes owner identity. This lookup can only return this repository's owner.
      const existing = await client.from("memories").select(columns).eq("user_id", ownerId)
        .eq("dedupe_key", dedupeKey).maybeSingle();
      if (existing.error || !existing.data) return storage(existing.error);
      return { memory: decode(existing.data), duplicate: true };
    },
    async list({ limit, offset }) {
      const { data, error } = await client.from("memories").select(columns).eq("user_id", ownerId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit);
      if (error) return storage(error);
      const rows = data ?? []; const hasMore = rows.length > limit;
      return { items: rows.slice(0, limit).map(decode), nextOffset: hasMore ? offset + limit : null };
    },
    async read(id) {
      const { data, error } = await client.from("memories").select(columns).eq("user_id", ownerId).eq("id", id).maybeSingle();
      if (error) return storage(error); if (!data) throw new MemoryRepositoryFailure("NOT_FOUND"); return decode(data);
    },
    async update(id, input: MemoryUpdate) {
      const row: Record<string, string> = {};
      if (input.title !== undefined) row.title = input.title;
      if (input.rawText !== undefined) row.raw_text = input.rawText;
      const { data, error } = await client.from("memories").update(row).eq("user_id", ownerId).eq("id", id).select(columns).maybeSingle();
      if (error) return storage(error); if (!data) throw new MemoryRepositoryFailure("NOT_FOUND"); return decode(data);
    },
    async delete(id) {
      const { data, error } = await client.from("memories").delete().eq("user_id", ownerId).eq("id", id).select("id").maybeSingle();
      if (error) return storage(error); if (!data) throw new MemoryRepositoryFailure("NOT_FOUND");
    },
  };
}
