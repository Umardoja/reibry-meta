import "server-only";
import type { JsonValue, Memory } from "../memory/contracts.ts";
import type { MemoryRepository } from "../memory/repository.ts";
import { SEARCH_CANDIDATE_MAX, validateRetrievalItem, type EvidenceField, type RetrievalItem, type RetrievalResponse, type RetrievalVideoEvidence } from "./contracts.ts";

// Conversational filler ("did I save anything about...") must not count as evidence terms.
const STOP = new Set(("a an and are as at by for from how i in is it me my of on or that the this to was what where which with you your " +
  "am be been being can could did do does done any anything something some have has had got get about please tell show find look " +
  "saved save remember know want need also just there then them they those these its im i'm we our us if so not no yes ok okay " +
  "hey hi hello thanks thank would should will meant mean help like maybe").split(" "));
export function normalizeQuery(value: string) {
  const phrase = value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const terms = [...new Set(phrase.split(" ").filter(term => term.length > 1 && !STOP.has(term)))].slice(0, 12);
  return { phrase, terms };
}
function normalized(value: string) { return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
// Captured provider/page metadata (creator, caption, hashtags, site) is searchable alongside the title and the user's own note.
function metadataValues(metadata: Record<string, JsonValue>) { return [metadata.author, metadata.platform, metadata.metadataProvider, metadata.siteName,
  metadata.caption, metadata.sharedText, Array.isArray(metadata.hashtags) ? metadata.hashtags.filter(tag => typeof tag === "string").map(tag => `#${tag}`).join(" ") : null]
  .filter((value): value is string => typeof value === "string" && !!value.trim()); }
function text(value: JsonValue | undefined, max: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
// Searchable text of an analysed video: what Muse Spark saw (scenes, on-screen text, observations) and what Voice Transcribe heard.
function videoText(memory: Memory) {
  const video = memory.video; if (!video?.visual) return "";
  return [video.summary, ...video.concepts, ...video.visual.observations, ...video.visual.scenes.flatMap(scene => [scene.background, scene.motion, ...scene.objects, ...scene.onScreenText]),
    video.transcript?.text].filter(Boolean).join(" ");
}
const short = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
/** Bounded, source-separated video evidence for the model (about 1.6 KB at most). */
function videoEvidence(memory: Memory): RetrievalVideoEvidence | null {
  if (memory.sourceType !== "video") return null;
  const video = memory.video; const visual = video?.visual;
  const scenes = (visual?.scenes ?? []).slice(0, 4).map(scene => short(`${scene.startSeconds}–${scene.endSeconds} s: ${scene.background} background; ${scene.objects.join(", ") || "no distinct objects"}${scene.onScreenText.length ? `; on-screen text "${scene.onScreenText.join(" / ")}"` : ""}; ${scene.motion}`, 220));
  let budget = 900;
  const transcript = (video?.transcript?.turns ?? []).slice(0, 8).flatMap(turn => { if (budget <= 0) return []; const text = short(turn.text, Math.min(200, budget)); budget -= text.length;
    return [{ startSeconds: Math.round(turn.startMs / 100) / 10, endSeconds: Math.round(turn.endMs / 100) / 10, text }]; });
  return { analyzed: video?.status === "ready" && !!visual, visual: [...scenes, ...(visual?.observations ?? []).slice(0, 4).map(item => short(item, 200))],
    transcript, speechTranscribed: !!video?.transcript?.text, hasAudio: !!video?.hasAudio,
    interpretations: (visual?.interpretations ?? []).slice(0, 3).map(item => short(`${item.claim} (based on ${item.basedOn})`, 200)), gaps: (visual?.gaps ?? []).slice(0, 4).map(item => short(item, 160)) };
}
function sourceDetails(memory: Memory): RetrievalItem["sourceDetails"] {
  if (memory.sourceType === "video") return { platform: null, creator: null, caption: null, sharedWithLink: null, userNote: memory.rawText ? memory.rawText.trim().slice(0, 280) : null };
  if (memory.sourceType !== "link") return null;
  return { platform: text(memory.metadata.platform, 40), creator: text(memory.metadata.author, 120), caption: text(memory.metadata.caption, 280),
    sharedWithLink: text(memory.metadata.sharedText, 280), userNote: memory.rawText ? memory.rawText.trim().slice(0, 280) : null };
}
function metadataText(metadata: Record<string, JsonValue>) { return metadataValues(metadata).join(" "); }
function hostOnly(sourceUrl: string | null) { try { return sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : ""; } catch { return ""; } }
// Hostname plus readable URL path words ("/docs/Web/JavaScript", "/wiki/Birthday_cake") are a weak but real signal for saved links.
// Long opaque tokens (IDs, hashes) are dropped so they never match conversational words.
function hostname(sourceUrl: string | null) { try { if (!sourceUrl) return ""; const url = new URL(sourceUrl);
  let path = url.pathname; try { path = decodeURIComponent(path); } catch { /* keep the raw path */ }
  return `${url.hostname.replace(/^www\./, "")} ${path.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\b(?=[\p{L}\p{N}]*\d)[\p{L}\p{N}]{8,}\b/gu, " ")}`.replace(/\s+/g, " ").trim(); } catch { return ""; } }
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
    fields[0] === "metadata" ? "Stored source metadata matches this query." : fields[0] === "video" ? "The analysed video content matches this query." : "The saved source hostname matches this query.";
}

export function rankMemories(memories: Memory[], query: string, limit: number): RetrievalResponse {
  const input = normalizeQuery(query);
  if (!input.terms.length) return { query: input.phrase, state: "no-match", items: [] };
  const ranked = memories.map(memory => {
    const values: Record<EvidenceField, string> = { title: memory.title, note: memory.rawText || "",
      metadata: metadataText(memory.metadata), hostname: hostname(memory.sourceUrl), video: videoText(memory) };
    const hits = Object.fromEntries((Object.keys(values) as EvidenceField[]).map(field => [field, matchedTerms(values[field], input.terms)])) as Record<EvidenceField, string[]>;
    // URL path words are a fallback signal: they count only for terms the title, note and metadata did not already match.
    const hostTerms = new Set(normalized(hostOnly(memory.sourceUrl)).split(" "));
    hits.hostname = hits.hostname.filter(term => hostTerms.has(term) || (!hits.title.includes(term) && !hits.note.includes(term) && !hits.metadata.includes(term)));
    const fields = (Object.keys(hits) as EvidenceField[]).filter(field => hits[field].length > 0 || normalized(values[field]).includes(input.phrase));
    if (!fields.length) return null;
    const coverage = (field: EvidenceField) => hits[field].length / input.terms.length;
    const phrase = (field: EvidenceField) => input.phrase.length > 2 && normalized(values[field]).includes(input.phrase);
    const exactTitle = normalized(values.title) === input.phrase;
    const score = Math.min(100, Math.round((exactTitle ? 40 : 0) + (phrase("title") ? 24 : 0) + coverage("title") * 30 +
      (phrase("note") ? 16 : 0) + coverage("note") * 18 + (phrase("metadata") ? 10 : 0) + coverage("metadata") * 12 +
      (phrase("hostname") ? 8 : 0) + coverage("hostname") * 10 + (phrase("video") ? 16 : 0) + coverage("video") * 18 + Math.max(0, fields.length - 1) * 2));
    const matchedSourceMetadata = metadataValues(memory.metadata).filter(value => matchedTerms(value, input.terms).length || normalized(value).includes(input.phrase)).slice(0, 3).map(value => value.slice(0, 200));
    const item: RetrievalItem = { memoryId: memory.id, memoryHref: `/memories#memory-${memory.id}`, displayTitle: memory.title,
      sourceType: memory.sourceType, storedExcerpt: memory.sourceType === "text" ? excerpt(memory.rawText, input.phrase, input.terms) : null,
      matchedSourceMetadata, sourceUrl: memory.sourceUrl, processingStatus: memory.analysisStatus, match: { reason: reason(fields), score: Math.max(1, score), fields }, sourceDetails: sourceDetails(memory), video: videoEvidence(memory), savedAt: memory.createdAt };
    return { item: validateRetrievalItem(item), createdAt: memory.createdAt };
  }).filter((value): value is { item: RetrievalItem; createdAt: string } => value !== null)
    .sort((a, b) => b.item.match.score - a.item.match.score || Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.item.memoryId.localeCompare(b.item.memoryId))
    .slice(0, limit).map(value => value.item);
  return { query: input.phrase, state: ranked.length ? "matches" : "no-match", items: ranked };
}

export async function searchOwnedMemories(repository: MemoryRepository, query: string, limit: number) {
  return rankMemories(await repository.searchCandidates(SEARCH_CANDIDATE_MAX), query, limit);
}

/** Evidence for a Memory the user is referring back to; the caller must have read it through the owner-bound repository. */
export function memoryEvidenceItem(memory: Memory, reason = "Shown earlier in this conversation."): RetrievalItem {
  return validateRetrievalItem({ memoryId: memory.id, memoryHref: `/memories#memory-${memory.id}`, displayTitle: memory.title,
    sourceType: memory.sourceType, storedExcerpt: memory.sourceType === "text" ? excerpt(memory.rawText, "", []) : null,
    matchedSourceMetadata: metadataValues(memory.metadata).slice(0, 3).map(value => value.slice(0, 200)), sourceUrl: memory.sourceUrl,
    processingStatus: memory.analysisStatus, match: { reason, score: 1, fields: ["title"] }, sourceDetails: sourceDetails(memory), video: videoEvidence(memory), savedAt: memory.createdAt });
}
