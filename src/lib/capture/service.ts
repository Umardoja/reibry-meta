import "server-only";
import { createHash } from "node:crypto";
import type { JsonValue, Memory } from "../memory/contracts.ts";
import { MemoryRepositoryFailure, type MemoryRepository } from "../memory/repository.ts";
import { deterministicTitle, type CaptureInput } from "./contracts.ts";
import { enrichLink, type FieldSource, type MetadataResult } from "./enrichment.ts";
import type { EnrichmentWriter } from "./trusted-enrichment.ts";
import { parsePublicLink, type ParsedCaptureUrl } from "./url-policy.ts";

/** Request 2 (enrichment) budget. Request 1 (save) performs no network metadata work at all. */
export const ENRICHMENT_BUDGET_MS = 6_000;

export type CaptureEnrichment = Pick<MetadataResult, "status" | "provider" | "reason">;
export type CaptureResult = { memory: Memory; duplicate: boolean; enrichment: CaptureEnrichment };
const enrichmentState = (memory: Memory): CaptureEnrichment["status"] => { const state = memory.metadata.enrichment;
  return state === "complete" || state === "partial" || state === "unavailable" || state === "timed-out" ? state : "pending"; };
export type LinkEnricher = (link: ParsedCaptureUrl) => Promise<MetadataResult>;
function key(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function noteTitle(content: string) { return deterministicTitle(content.split(/\r?\n/, 1)[0] || "Saved note"); }

async function withinBudget(work: Promise<MetadataResult>, budgetMs: number): Promise<MetadataResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<MetadataResult>(resolve => { timer = setTimeout(() => resolve({ status: "timed-out", provider: null, reason: "provider-timeout", provenance: {} }), budgetMs); });
  try { return await Promise.race([work.catch((): MetadataResult => ({ status: "unavailable", provider: null, reason: "provider-error", provenance: {} })), late]); }
  finally { clearTimeout(timer); }
}
const platformLabel: Record<ParsedCaptureUrl["platform"], string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", web: "Web" };
function placeholderTitle(link: ParsedCaptureUrl) {
  if (link.platform === "web") return deterministicTitle(link.hostname);
  const kind = link.format === "short" ? "Short" : link.format === "reel" ? "reel" : link.format === "post" || link.format === "photo" ? "post" : "video";
  return deterministicTitle(link.creatorHandle ? `${platformLabel[link.platform]} ${kind} by ${link.creatorHandle}` : `${platformLabel[link.platform]} ${kind}`);
}

function provenanceOf(memory: Memory) {
  const value = memory.metadata.provenance;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, JsonValue> : null;
}
function isPlaceholderTitle(memory: Memory, link: ParsedCaptureUrl) {
  const provenance = provenanceOf(memory);
  if (provenance) return provenance.title === "reibry-placeholder";
  // Rows saved before Stage 12I have no provenance; their placeholder title was the bare hostname.
  try { return memory.title === link.hostname || memory.title === new URL(memory.sourceUrl ?? link.normalized).hostname; } catch { return false; }
}
/** A repeated share returns the existing Memory, filling only owner-updatable fields: a missing note and a placeholder title. */
async function improveDuplicate(memory: Memory, repository: MemoryRepository, link: ParsedCaptureUrl, input: CaptureInput) {
  const update: { title?: string; rawText?: string } = {};
  if (input.note && !memory.rawText) update.rawText = input.note;
  if (input.title && input.title !== memory.title && isPlaceholderTitle(memory, link)) update.title = input.title;
  return Object.keys(update).length ? repository.update(memory.id, update) : memory;
}

/** Request 1 (save): validate, canonicalize, deduplicate and persist immediately. No provider or page is contacted. */
export async function capture(input: CaptureInput, repository: MemoryRepository): Promise<CaptureResult> {
  if (input.sourceType === "text") {
    const canonical = input.content.replace(/\r\n/g, "\n").trim();
    const created = await repository.createUnique({ title: input.title || noteTitle(canonical), sourceType: "text", sourceUrl: null,
      rawText: canonical, analysisStatus: "processing", metadata: { capture: "note", enrichment: "not-applicable" } }, key(`text\0${canonical}`));
    return { ...created, enrichment: { status: "unsupported", provider: null } };
  }
  const link = parsePublicLink(input.content);
  // A full TikTok post link matches an earlier share-link Memory whose post ID enrichment already verified (a database read only;
  // the save never contacts TikTok). Different post IDs never match.
  if (link.platform === "tiktok" && link.postId && repository.findLinkByPostId) {
    const earlier = await repository.findLinkByPostId("tiktok", link.postId);
    if (earlier) { const memory = await improveDuplicate(earlier, repository, link, input); return { memory, duplicate: true, enrichment: { status: enrichmentState(memory), provider: null } }; }
  }
  const metadata: Record<string, JsonValue> = { capture: "link", platform: link.platform, normalizedUrl: link.normalized, format: link.format, enrichment: "pending",
    metadataProvider: null, provenance: { title: input.title ? "user" : "reibry-placeholder", ...(link.creatorHandle ? { author: "url" } : {}), ...(input.note ? { note: "user" } : {}) } };
  if (link.postId) metadata.postId = link.postId;
  if (link.creatorHandle) metadata.author = link.creatorHandle;
  // analysis_status describes AI analysis, which capture does not perform; provider metadata state lives in metadata.enrichment.
  const created = await repository.createUnique({ title: input.title || placeholderTitle(link), sourceType: "link", sourceUrl: link.submitted,
    rawText: input.note ?? null, analysisStatus: "processing", metadata }, key(`link\0${link.identity}`));
  const memory = created.duplicate ? await improveDuplicate(created.memory, repository, link, input) : created.memory;
  return { ...created, memory, enrichment: { status: enrichmentState(memory), provider: null } };
}

const ASCII_TAG = /^[A-Za-z0-9_]{2,40}$/;
/** The allowlisted enrichment fields the trusted database function accepts. Provenance never claims "user". */
export function enrichmentDetails(metadata: MetadataResult): Record<string, JsonValue> {
  const details: Record<string, JsonValue> = { enrichment: metadata.status === "unsupported" ? "unavailable" : metadata.status, metadataProvider: metadata.provider, enrichedAt: new Date().toISOString() };
  if (metadata.reason) details.enrichmentReason = metadata.reason;
  const optional = { author: metadata.author, authorUrl: metadata.authorUrl, caption: metadata.caption, thumbnailUrl: metadata.thumbnailUrl, publishedAt: metadata.publishedAt,
    durationSeconds: metadata.durationSeconds, siteName: metadata.siteName, canonicalUrl: metadata.canonicalUrl ?? metadata.resolved?.normalized, postId: metadata.resolved?.postId ?? undefined };
  for (const [name, value] of Object.entries(optional)) if (value !== undefined && value !== null) details[name] = value;
  const hashtags = (metadata.hashtags ?? []).filter(tag => ASCII_TAG.test(tag)).slice(0, 10); if (hashtags.length) details.hashtags = hashtags;
  const provenance: Record<string, FieldSource> = {};
  for (const [field, source] of Object.entries(metadata.provenance)) if (source && source !== "user") provenance[field] = source;
  details.provenance = provenance;
  return details;
}

/**
 * Request 2 (enrich): bounded, best-effort metadata for one saved link the verified user owns, persisted through the trusted
 * writer. Reading through the owner-bound repository first proves ownership; the database function re-checks it.
 */
export async function enrichSavedLink(memoryId: string, repository: MemoryRepository, writer: EnrichmentWriter,
  enrich: LinkEnricher = link => enrichLink(link, { timeoutMs: ENRICHMENT_BUDGET_MS - 1_000 }), budgetMs = ENRICHMENT_BUDGET_MS) {
  const owned = await repository.read(memoryId);
  if (owned.sourceType !== "link" || !owned.sourceUrl) return { memory: owned, enrichment: { status: "unsupported", provider: null } as CaptureEnrichment };
  const metadata = await withinBudget(enrich(parsePublicLink(owned.sourceUrl)), budgetMs);
  const enrichment = { status: metadata.status, provider: metadata.provider, ...(metadata.reason ? { reason: metadata.reason } : {}) } as CaptureEnrichment;
  // A TikTok share link resolved (by the bounded, SSRF-safe redirect resolver) to a post this user already saved: same verified post ID,
  // so the two are one Memory. The OLDER Memory is kept; the other's note and user title fill only what the kept one lacks.
  const postId = metadata.resolved?.platform === "tiktok" ? metadata.resolved.postId : null;
  const other = postId && repository.findLinkByPostId ? await repository.findLinkByPostId("tiktok", postId, owned.id) : null;
  if (other) {
    const [kept, merged] = Date.parse(other.createdAt) <= Date.parse(owned.createdAt) ? [other, owned] : [owned, other];
    let memory = kept;
    if (kept.metadata.enrichment !== "complete") memory = await writer(kept.id, enrichmentDetails(metadata), metadata.title ?? null);
    memory = await improveDuplicate(memory, repository, parsePublicLink(memory.sourceUrl ?? owned.sourceUrl),
      { sourceType: "link", content: merged.sourceUrl ?? "", note: merged.rawText ?? undefined, title: provenanceOf(merged)?.title === "user" ? merged.title : undefined });
    try { await repository.delete(merged.id); } catch (error) { if (!(error instanceof MemoryRepositoryFailure && error.code === "NOT_FOUND")) throw error; }
    return { memory, enrichment, mergedDuplicate: { removedId: merged.id, postId } };
  }
  const memory = await writer(owned.id, enrichmentDetails(metadata), metadata.title ?? null);
  return { memory, enrichment };
}
