// Read-only Today resurfacing adapts original integration/today-ranking.ts and orchestrator.today().
import type { LifeContext } from "../life/contracts.ts";
import type { LifeRepository } from "../life/repository.ts";
import type { JsonValue, Memory } from "../memory/contracts.ts";
import type { MemoryRepository } from "../memory/repository.ts";
import { TODAY_CONTEXT_SCAN_MAX, TODAY_ITEM_MAX, TODAY_MATCH_CONTEXT_MAX, TODAY_MEMORY_SCAN_MAX,
  toTodayLifeItem, validateTodayFeed, type TodayResurfacedMemory } from "./contracts.ts";

const STOP = new Set("a an and are as at by for from in is it my of on or that the this to with your event goal deadline trip task project interest reminder plan plans today tomorrow tonight next coming upcoming soon week weeks month months monday tuesday wednesday thursday friday saturday sunday".split(" "));
type EvidenceField = TodayResurfacedMemory["evidenceFields"][number];

export function todayTerms(value: string) {
  return [...new Set(value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/)
    .filter(term => term.length > 2 && !STOP.has(term)))].slice(0, 12);
}
function metadataValues(metadata: Record<string, JsonValue>) {
  return [metadata.author, metadata.platform, metadata.metadataProvider].filter((value): value is string => typeof value === "string" && !!value.trim());
}
function hostname(sourceUrl: string | null) { try { return sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : ""; } catch { return ""; } }
function excerpt(value: string | null, terms: string[]) {
  if (!value) return null; const clean = value.replace(/\s+/g, " ").trim(); const lower = clean.toLocaleLowerCase("en");
  const position = terms.map(term => lower.indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, position - 80); const end = Math.min(clean.length, start + 276);
  return `${start ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}
function evidence(memory: Memory, terms: string[]) {
  const values: Record<EvidenceField, string> = { title: memory.title, note: memory.sourceType === "text" ? memory.rawText || "" : "",
    metadata: metadataValues(memory.metadata).join(" "), hostname: hostname(memory.sourceUrl) };
  const fields: EvidenceField[] = []; const hits = new Set<string>();
  for (const field of Object.keys(values) as EvidenceField[]) {
    const tokens = new Set(todayTerms(values[field])); const matched = terms.filter(term => tokens.has(term));
    if (matched.length) { fields.push(field); matched.forEach(term => hits.add(term)); }
  }
  return { fields, hits: [...hits].sort(), values };
}
function candidate(memory: Memory, context: LifeContext, now: Date): TodayResurfacedMemory | null {
  if (memory.analysisStatus === "failed") return null;
  const terms = todayTerms(`${context.title} ${context.description || ""}`); if (!terms.length) return null;
  const found = evidence(memory, terms); const coverage = found.hits.length / terms.length;
  if (!found.fields.length || (coverage < .25 && found.hits.length < 2)) return null;
  const weights: Record<EvidenceField, number> = { title: 28, note: 20, metadata: 14, hostname: 12 };
  const date = context.startDate ? Date.parse(context.startDate) : NaN; const days = Number.isFinite(date) ? Math.max(0, date - now.getTime()) / 86_400_000 : Infinity;
  const proximity = days <= 1 ? 12 : days <= 3 ? 6 : days <= 7 ? 2 : 0;
  const score = Math.min(100, Math.max(1, Math.round(coverage * 55 + Math.max(...found.fields.map(field => weights[field])) + proximity)));
  const labels: Record<EvidenceField, string> = { title: "saved title", note: "saved note text", metadata: "stored source metadata", hostname: "saved source hostname" };
  const matched = found.hits.slice(0, 3).join(", "); const sourceList = found.fields.slice(0, 2).map(field => labels[field]).join(" and ");
  const metadataOnly = memory.sourceType === "link";
  return { memoryId: memory.id, memoryHref: `/memories/${memory.id}`, displayTitle: memory.title, sourceType: memory.sourceType,
    sourceLabel: memory.sourceType === "text" ? "Saved note" : hostname(memory.sourceUrl) || "Saved link", processingStatus: memory.analysisStatus,
    storedExcerpt: memory.sourceType === "text" ? excerpt(memory.rawText, found.hits) : null, lifeContext: toTodayLifeItem(context),
    reason: `${sourceList[0].toUpperCase()}${sourceList.slice(1)} matches “${matched}” from “${context.title}”.${metadataOnly ? " This link is matched from stored metadata only." : ""}`,
    score, evidenceFields: found.fields, evidenceLimit: metadataOnly ? "metadata-only" : "stored-note" };
}

export async function buildTodayFeed(memoryRepository: MemoryRepository, lifeRepository: LifeRepository, now = new Date()) {
  if (memoryRepository.ownerId !== lifeRepository.ownerId) throw new Error("owner-mismatch");
  const generatedAt = now.toISOString();
  const [contexts, memories] = await Promise.all([
    lifeRepository.listUpcoming(generatedAt, TODAY_CONTEXT_SCAN_MAX),
    memoryRepository.searchCandidates(TODAY_MEMORY_SCAN_MAX),
  ]);
  if (contexts.some(context => context.userId !== lifeRepository.ownerId) || memories.some(memory => memory.userId !== memoryRepository.ownerId))
    throw new Error("owner-mismatch");
  const upcoming = contexts.filter(context => context.status === "active" && !!context.startDate && Date.parse(context.startDate) >= now.getTime())
    .sort((a, b) => Date.parse(a.startDate || "") - Date.parse(b.startDate || "") || a.id.localeCompare(b.id));
  const ranked = upcoming.slice(0, TODAY_MATCH_CONTEXT_MAX).flatMap(context => memories.map(memory => {
    const item = candidate(memory, context, now); return item ? { item, memoryCreatedAt: memory.createdAt, contextAt: context.startDate || "" } : null;
  }).filter((value): value is { item: TodayResurfacedMemory; memoryCreatedAt: string; contextAt: string } => value !== null))
    .sort((a, b) => b.item.score - a.item.score || a.contextAt.localeCompare(b.contextAt) || b.memoryCreatedAt.localeCompare(a.memoryCreatedAt) || a.item.memoryId.localeCompare(b.item.memoryId));
  const seen = new Set<string>(); const resurfacedMemories = ranked.filter(value => !seen.has(value.item.memoryId) && seen.add(value.item.memoryId)).slice(0, TODAY_ITEM_MAX).map(value => value.item);
  return validateTodayFeed({ generatedAt, upcomingLifeContexts: upcoming.slice(0, TODAY_ITEM_MAX).map(toTodayLifeItem), resurfacedMemories });
}
