// Lexical evidence contract adapted from original REIBRY retrieval types at source 76d3494.
// It intentionally contains stored evidence and ranking metadata, never model interpretation.
import type { MemorySourceType, MemoryStatus } from "../memory/contracts.ts";

export const SEARCH_QUERY_MAX = 200;
export const SEARCH_RESULT_MAX = 20;
export const SEARCH_CANDIDATE_MAX = 250;
export type EvidenceField = "title" | "note" | "metadata" | "hostname";
export type RetrievalItem = {
  memoryId: string;
  memoryHref: string;
  displayTitle: string;
  sourceType: MemorySourceType;
  storedExcerpt: string | null;
  matchedSourceMetadata: string[];
  sourceUrl: string | null;
  processingStatus: MemoryStatus;
  match: { reason: string; score: number; fields: EvidenceField[] };
  /** Captured-link details with their origin: provider/page metadata vs the user's own note. Never a transcript or visual analysis. */
  sourceDetails?: { platform: string | null; creator: string | null; caption: string | null; userNote: string | null } | null;
  /** When the Memory was saved, so "the course I just saved" can be resolved by recency. */
  savedAt?: string;
  /** Home only: how REIBRY resolved that the user means this Memory ("the second one", "the Mosh one", "just saved"). */
  referenceHint?: string | null;
  /** Home only: how many owned Memories are the same saved item; only this representative is sent as evidence. */
  timesSaved?: number;
};
export type RetrievalResponse = { query: string; state: "matches" | "no-match"; items: RetrievalItem[] };
export type SearchRequest = { query: string; limit: number };
export class RetrievalContractError extends Error {}

export function parseSearchRequest(url: URL): SearchRequest {
  if ([...url.searchParams.keys()].some(key => key !== "q" && key !== "limit")) throw new RetrievalContractError("Unsupported search parameter.");
  const raw = url.searchParams.get("q");
  if (raw === null || !raw.trim() || raw.length > SEARCH_QUERY_MAX) throw new RetrievalContractError(`Search query must contain 1-${SEARCH_QUERY_MAX} characters.`);
  const limitValue = url.searchParams.get("limit");
  if (limitValue !== null && !/^\d+$/.test(limitValue)) throw new RetrievalContractError("Invalid result limit.");
  const limit = limitValue === null ? 10 : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SEARCH_RESULT_MAX) throw new RetrievalContractError("Invalid result limit.");
  return { query: raw, limit };
}

export function validateRetrievalItem(item: RetrievalItem) {
  if (!/^[0-9a-f-]{36}$/i.test(item.memoryId) || item.memoryHref !== `/memories#memory-${item.memoryId}`)
    throw new RetrievalContractError("Invalid retrieval identity.");
  if (!item.displayTitle || item.displayTitle.length > 200 || (item.storedExcerpt?.length ?? 0) > 280)
    throw new RetrievalContractError("Invalid retrieval evidence.");
  if (!Array.isArray(item.matchedSourceMetadata) || item.matchedSourceMetadata.length > 3 || item.matchedSourceMetadata.some(value => !value || value.length > 200))
    throw new RetrievalContractError("Invalid retrieval metadata.");
  if (!Number.isInteger(item.match.score) || item.match.score < 1 || item.match.score > 100 || !item.match.fields.length)
    throw new RetrievalContractError("Invalid retrieval ranking.");
  return item;
}
