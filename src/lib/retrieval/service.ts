import "server-only";
import type { JsonValue, Memory } from "../memory/contracts.ts";
import type { MemoryRepository } from "../memory/repository.ts";
import { SEARCH_CANDIDATE_MAX, validateRetrievalItem, type EvidenceField, type RetrievalItem, type RetrievalResponse } from "./contracts.ts";

const STOP = new Set("a an and are as at by for from how i in is it me my of on or that the this to was what where which with you your".split(" "));
export function normalizeQuery(value: string) {
  const phrase = value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const terms = [...new Set(phrase.split(" ").filter(term => term.length > 1 && !STOP.has(term)))].slice(0, 12);
  return { phrase, terms };
}
function normalized(value: string) { return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function metadataText(metadata: Record<string, JsonValue>) {
  return [metadata.author, metadata.platform, metadata.metadataProvider]
    .filter((value): value is string => typeof value === "string").join(" ");
}
function hostname(sourceUrl: string | null) { try { return sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : ""; } catch { return ""; } }
function matchedTerms(text: string, terms: string[]) { const source = new Set(normalized(text).split(" ")); return terms.filter(term => source.has(term)); }
function excerpt(value: string | null, phrase: string, terms: string[]) {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ").trim(); const lower = clean.toLocaleLowerCase("en");
  let index = phrase.length > 2 ? lower.indexOf(phrase) : -1;
  if (index < 0) index = terms.map(term => lower.indexOf(term)).filter(position => position >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 90); const end = Math.min(clean.length, start + 276);
  return `${start ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}
function reason(fields: EvidenceField[]) {
  if (fields.length > 1) return "Multiple stored fields match this query.";
  return fields[0] === "title" ? "The saved title matches this query." : fields[0] === "note" ? "The saved note text matches this query." :
    fields[0] === "metadata" ? "Stored source metadata matches this query." : "The saved source hostname matches this query.";
}

export function rankMemories(memories: Memory[], query: string, limit: number): RetrievalResponse {
  const input = normalizeQuery(query);
  if (!input.terms.length) return { query: input.phrase, state: "no-match", items: [] };
  const ranked = memories.map(memory => {
    const values: Record<EvidenceField, string> = { title: memory.title, note: memory.rawText || "",
      metadata: metadataText(memory.metadata), hostname: hostname(memory.sourceUrl) };
    const hits = Object.fromEntries((Object.keys(values) as EvidenceField[]).map(field => [field, matchedTerms(values[field], input.terms)])) as Record<EvidenceField, string[]>;
    const fields = (Object.keys(hits) as EvidenceField[]).filter(field => hits[field].length > 0 || normalized(values[field]).includes(input.phrase));
    if (!fields.length) return null;
    const coverage = (field: EvidenceField) => hits[field].length / input.terms.length;
    const phrase = (field: EvidenceField) => input.phrase.length > 2 && normalized(values[field]).includes(input.phrase);
    const exactTitle = normalized(values.title) === input.phrase;
    const score = Math.min(100, Math.round((exactTitle ? 40 : 0) + (phrase("title") ? 24 : 0) + coverage("title") * 30 +
      (phrase("note") ? 16 : 0) + coverage("note") * 18 + (phrase("metadata") ? 10 : 0) + coverage("metadata") * 12 +
      (phrase("hostname") ? 8 : 0) + coverage("hostname") * 10 + Math.max(0, fields.length - 1) * 2));
    const item: RetrievalItem = { memoryId: memory.id, memoryHref: `/memories#memory-${memory.id}`, displayTitle: memory.title,
      sourceType: memory.sourceType, storedExcerpt: memory.sourceType === "text" ? excerpt(memory.rawText, input.phrase, input.terms) : null,
      sourceUrl: memory.sourceUrl, processingStatus: memory.analysisStatus, match: { reason: reason(fields), score: Math.max(1, score), fields } };
    return { item: validateRetrievalItem(item), createdAt: memory.createdAt };
  }).filter((value): value is { item: RetrievalItem; createdAt: string } => value !== null)
    .sort((a, b) => b.item.match.score - a.item.match.score || Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.item.memoryId.localeCompare(b.item.memoryId))
    .slice(0, limit).map(value => value.item);
  return { query: input.phrase, state: ranked.length ? "matches" : "no-match", items: ranked };
}

export async function searchOwnedMemories(repository: MemoryRepository, query: string, limit: number) {
  return rankMemories(await repository.searchCandidates(SEARCH_CANDIDATE_MAX), query, limit);
}
