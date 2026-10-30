import "server-only";
import { createHash } from "node:crypto";
import type { JsonValue, Memory } from "../memory/contracts.ts";
import type { MemoryRepository } from "../memory/repository.ts";
import { deterministicTitle, type CaptureInput } from "./contracts.ts";
import { enrichLink, type FieldSource, type MetadataResult } from "./enrichment.ts";
import { parsePublicLink, type ParsedCaptureUrl } from "./url-policy.ts";

/** The save never waits longer than this for provider metadata; a slow or blocked provider leaves a saved link with limited details. */
export const CAPTURE_ENRICHMENT_BUDGET_MS = 1_800;
/** A user-initiated details retry may wait longer, because the Memory is already saved. */
export const DETAILS_RETRY_BUDGET_MS = 5_000;

export type CaptureEnrichment = Pick<MetadataResult, "status" | "provider" | "reason">;
export type CaptureResult = { memory: Memory; duplicate: boolean; enrichment: CaptureEnrichment };
export type LinkEnricher = (link: ParsedCaptureUrl) => Promise<MetadataResult>;
function key(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function noteTitle(content: string) { return deterministicTitle(content.split(/\r?\n/, 1)[0] || "Saved note"); }

async function withinBudget(work: Promise<MetadataResult>, budgetMs: number): Promise<MetadataResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<MetadataResult>(resolve => { timer = setTimeout(() => resolve({ status: "timed-out", provider: null, reason: "save-budget-exceeded", provenance: {} }), budgetMs); });
  try { return await Promise.race([work.catch((): MetadataResult => ({ status: "unavailable", provider: null, reason: "provider-error", provenance: {} })), late]); }
  finally { clearTimeout(timer); }
}
const platformLabel: Record<ParsedCaptureUrl["platform"], string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", web: "Web" };
function placeholderTitle(link: ParsedCaptureUrl, metadata: MetadataResult) {
  const label = platformLabel[link.platform]; const kind = link.format === "short" ? "Short" : link.format === "reel" ? "reel" : link.format === "post" || link.format === "photo" ? "post" : "video";
  if (link.platform === "web") return deterministicTitle(metadata.siteName ? `${metadata.siteName} page` : link.hostname);
  return deterministicTitle(metadata.author ? `${label} ${kind} by ${metadata.author}` : `${label} ${kind}`);
}

export function linkMetadata(link: ParsedCaptureUrl, metadata: MetadataResult, titleSource: FieldSource, hasNote: boolean): Record<string, JsonValue> {
  const fields: Record<string, JsonValue> = { capture: "link", platform: link.platform, normalizedUrl: link.normalized, format: link.format,
    enrichment: metadata.status, metadataProvider: metadata.provider, enrichedAt: new Date().toISOString() };
  if (metadata.reason) fields.enrichmentReason = metadata.reason;
  if (link.postId) fields.postId = link.postId;
  const optional = { author: metadata.author, authorUrl: metadata.authorUrl, caption: metadata.caption, thumbnailUrl: metadata.thumbnailUrl,
    publishedAt: metadata.publishedAt, durationSeconds: metadata.durationSeconds, siteName: metadata.siteName, canonicalUrl: metadata.canonicalUrl };
  for (const [name, value] of Object.entries(optional)) if (value !== undefined) fields[name] = value;
  if (metadata.hashtags?.length) fields.hashtags = metadata.hashtags;
  // Field-level provenance: what the user wrote vs what a provider/page supplied vs REIBRY's own placeholder. Nothing is AI-inferred here.
  fields.provenance = { ...metadata.provenance, title: titleSource, ...(hasNote ? { note: "user" } : {}) };
  return fields;
}

export async function capture(input: CaptureInput, repository: MemoryRepository, enrich: LinkEnricher = enrichLink,
  budgetMs = CAPTURE_ENRICHMENT_BUDGET_MS): Promise<CaptureResult> {
  if (input.sourceType === "text") {
    const canonical = input.content.replace(/\r\n/g, "\n").trim();
    const created = await repository.createUnique({ title: input.title || noteTitle(canonical), sourceType: "text", sourceUrl: null,
      rawText: canonical, analysisStatus: "processing", metadata: { capture: "note", enrichment: "not-applicable" } }, key(`text\0${canonical}`));
    return { ...created, enrichment: { status: "unsupported", provider: null } };
  }
  const submitted = parsePublicLink(input.content);
  // Phase 1 (save): enrichment races a fixed budget; the insert below always runs, so a slow provider never loses the link.
  const metadata = await withinBudget(enrich(submitted), budgetMs);
  const link = metadata.resolved ?? submitted;
  const titleSource: FieldSource = input.title ? "user" : metadata.title ? metadata.provenance.title ?? "page-metadata" : "reibry-placeholder";
  const title = input.title || metadata.title || placeholderTitle(link, metadata);
  const created = await repository.createUnique({ title, sourceType: "link", sourceUrl: submitted.submitted, rawText: input.note ?? null,
    // analysis_status describes AI analysis, which capture does not perform; provider metadata state lives in metadata.enrichment.
    analysisStatus: "processing", metadata: linkMetadata(link, metadata, titleSource, !!input.note) },
    key(`link\0${link.identity}`));
  const memory = created.duplicate ? await improveDuplicate(created.memory, repository, link, input, titleSource === "user" ? null : metadata.title) : created.memory;
  return { ...created, memory, enrichment: { status: metadata.status, provider: metadata.provider, ...(metadata.reason ? { reason: metadata.reason } : {}) } };
}

function isPlaceholderTitle(memory: Memory, link: ParsedCaptureUrl) {
  const provenance = memory.metadata.provenance && typeof memory.metadata.provenance === "object" && !Array.isArray(memory.metadata.provenance) ? memory.metadata.provenance as Record<string, JsonValue> : null;
  if (provenance) return provenance.title === "reibry-placeholder";
  // Rows saved before Stage 12I have no provenance; their placeholder title was the bare hostname.
  try { return memory.title === link.hostname || memory.title === new URL(memory.sourceUrl ?? link.normalized).hostname; } catch { return false; }
}
/** A repeated share returns the existing Memory, filling only what the owner may update: a missing note and a placeholder title. */
async function improveDuplicate(memory: Memory, repository: MemoryRepository, link: ParsedCaptureUrl, input: CaptureInput, providerTitle: string | undefined | null) {
  const update: { title?: string; rawText?: string } = {};
  if (input.note && !memory.rawText) update.rawText = input.note;
  const title = input.title || providerTitle;
  if (title && title !== memory.title && isPlaceholderTitle(memory, link)) update.title = title;
  return Object.keys(update).length ? repository.update(memory.id, update) : memory;
}

/**
 * Phase 2 (user-initiated retry). The current hosted grants let an owner update only title and raw_text, so a retry can persist an
 * improved title when the saved one is REIBRY's placeholder; other refreshed fields are returned but cannot be stored without the
 * documented enrichment-update migration.
 */
export async function refreshLinkDetails(memoryId: string, repository: MemoryRepository,
  // The save-time per-host limits are too short for a deliberate retry; each provider may use most of the retry budget.
  enrich: LinkEnricher = link => enrichLink(link, { timeoutMs: DETAILS_RETRY_BUDGET_MS - 500 }), budgetMs = DETAILS_RETRY_BUDGET_MS) {
  const memory = await repository.read(memoryId);
  if (memory.sourceType !== "link" || !memory.sourceUrl) return { memory, details: null, persisted: [] as string[] };
  const metadata = await withinBudget(enrich(parsePublicLink(memory.sourceUrl)), budgetMs);
  if (metadata.title && metadata.title !== memory.title && isPlaceholderTitle(memory, parsePublicLink(memory.sourceUrl))) {
    const updated = await repository.update(memoryId, { title: metadata.title });
    return { memory: updated, details: metadata, persisted: ["title"] };
  }
  return { memory, details: metadata, persisted: [] as string[] };
}
