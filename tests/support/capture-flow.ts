// Test-only save-then-enrich flow. The in-memory writer mirrors public.apply_trusted_link_enrichment:
// owner + link check, allowlisted fields, placeholder-only title replacement, raw_text (user note) never touched.
import type { JsonValue, Memory } from "../../src/lib/memory/contracts.ts";
import { serializeMemory } from "../../src/lib/memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../../src/lib/memory/repository.ts";
import type { CaptureInput } from "../../src/lib/capture/contracts.ts";
import { capture, enrichSavedLink, type LinkEnricher } from "../../src/lib/capture/service.ts";
import type { EnrichmentWriter } from "../../src/lib/capture/trusted-enrichment.ts";
import { createInMemoryMemoryRepository, createMemoryTestState, type MemoryTestState } from "./in-memory-memory-repository.ts";

const states = new WeakMap<MemoryRepository, MemoryTestState>();
const allowed = new Set(["enrichment", "enrichmentReason", "metadataProvider", "author", "authorUrl", "caption", "thumbnailUrl", "publishedAt",
  "durationSeconds", "siteName", "canonicalUrl", "postId", "hashtags", "provenance", "enrichedAt"]);

export function trackedRepository(owner: string, state: MemoryTestState = createMemoryTestState()) {
  const repository = createInMemoryMemoryRepository(owner, state); states.set(repository, state); return repository;
}
export function createInMemoryEnrichmentWriter(userId: string, state: MemoryTestState): EnrichmentWriter {
  return async (memoryId, details, providerTitle) => {
    const memory = state.get(memoryId);
    if (!memory || memory.userId !== userId || memory.sourceType !== "link") throw new MemoryRepositoryFailure("NOT_FOUND");
    for (const key of Object.keys(details)) if (!allowed.has(key)) throw new MemoryRepositoryFailure("STORAGE_UNAVAILABLE");
    const old = memory.metadata.provenance && typeof memory.metadata.provenance === "object" && !Array.isArray(memory.metadata.provenance) ? memory.metadata.provenance as Record<string, JsonValue> : null;
    let host = ""; try { host = new URL(memory.sourceUrl ?? "").hostname; } catch { /* no URL */ }
    const placeholder = old ? old.title === "reibry-placeholder" : memory.title === host;
    const incoming = (details.provenance ?? {}) as Record<string, JsonValue>;
    const { title: incomingTitle, note: _note, ...facts } = incoming; void _note;
    const replaceTitle = !!providerTitle && placeholder && incomingTitle !== undefined;
    const provenance: Record<string, JsonValue> = { ...(old ?? {}), ...facts, ...(replaceTitle ? { title: incomingTitle } : {}) };
    const { provenance: _drop, ...rest } = details; void _drop;
    const updated: Memory = { ...memory, title: replaceTitle ? providerTitle! : memory.title, metadata: { ...memory.metadata, ...rest, provenance }, updatedAt: "2026-10-30T12:00:00.000Z" };
    state.set(memoryId, serializeMemory(updated)); return serializeMemory(updated);
  };
}
/** Request 1 (save) then, for links with an enricher, request 2 (enrich + trusted write). */
export async function saveAndEnrich(input: CaptureInput, repository: MemoryRepository, enricher?: LinkEnricher, budgetMs?: number) {
  const saved = await capture(input, repository);
  if (input.sourceType !== "link" || !enricher) return saved;
  const enriched = await enrichSavedLink(saved.memory.id, repository, createInMemoryEnrichmentWriter(repository.ownerId, states.get(repository)!), enricher, budgetMs);
  return { ...saved, memory: enriched.memory, enrichment: enriched.enrichment };
}
