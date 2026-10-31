// Stage 12J-3: one consumer-facing view of a Memory, shared by Capture, the Memories collection, Memory pages and Plans.
// It only ever shows what is actually stored, labelled by where it came from: the platform (title, caption, cover, creator), the user's
// own note, or a real video analysis. It never invents a description from a URL, and engineering fields (IDs, statuses, provider
// codes, schema names) never reach the screen.
import type { JsonValue, Memory } from "./contracts.ts";

export type MemoryKind = "tiktok" | "youtube" | "instagram" | "web" | "note" | "video";
export type KnowledgeGroup = { heading: string; items: string[] };
export type MemoryView = {
  id: string; href: string; kind: MemoryKind; kindLabel: string; platformName: string;
  title: string; titleIsGeneric: boolean; creator: string | null;
  /** A short, true description and where it came from. Null when nothing beyond the link is known. */
  summary: { text: string; from: string } | null;
  note: string | null; thumbnail: string | null; savedLabel: string; savedAt: string;
  originalUrl: string | null; openLabel: string | null; hashtags: string[];
  /** Links only: whether the platform shared its details yet, in plain language. */
  details: { state: "ready" | "limited" | "pending" | "none"; message: string | null };
  knows: KnowledgeGroup[]; unknown: string[]; videoAnalysed: boolean;
};

const text = (value: JsonValue | undefined | null) => typeof value === "string" && value.trim() ? value.trim() : null;
const platformNames: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram" };
// Plain-language explanations for metadata a platform did not provide. The link itself is always saved.
const detailReasons: Record<string, string> = {
  "provider-timeout": "The platform took too long to share details. You can try again later.",
  "save-budget-exceeded": "Details took a while, so REIBRY saved the link first.",
  "not-found-or-private": "The post may be private, deleted or unavailable where you are.",
  "provider-blocked": "This site doesn't allow previews.",
  "instagram-requires-meta-app-token": "Instagram doesn't share post details with apps like REIBRY yet, so only the link is saved.",
  "share-link-unresolved": "This share link didn't lead to a specific post, so only the link is saved.",
  // TikTok's oEmbed confirmed the post but returned no title or cover; that says nothing about whether the video itself has a caption.
  "provider-returned-no-title": "Saved. REIBRY couldn't retrieve this video's description or cover.",
  "unsafe-destination": "REIBRY doesn't open this kind of link, so only the link is saved.",
  "not-a-web-page": "This link isn't a web page, so there was nothing to preview.",
  "no-page-metadata": "The page doesn't publish a preview.",
  "provider-error": "The platform didn't return any details.",
};
export function detailsMessage(state: unknown, reason: unknown) {
  if (state === "complete") return null;
  if (state === "pending" || state === undefined) return null;
  return (typeof reason === "string" && detailReasons[reason]) || (state === "partial" ? "Only some details were available." : "Only the link is saved.");
}

export function kindOf(memory: Memory): MemoryKind {
  if (memory.sourceType === "text") return "note";
  if (memory.sourceType === "video") return "video";
  const platform = text(memory.metadata.platform);
  return platform === "tiktok" || platform === "youtube" || platform === "instagram" ? platform : "web";
}
function hostOf(url: string | null) { try { return url ? new URL(url).hostname.replace(/^(?:www|m)\./, "") : null; } catch { return null; } }
function kindLabelOf(memory: Memory, kind: MemoryKind) {
  const format = text(memory.metadata.format);
  if (kind === "tiktok") return format === "photo" ? "TikTok post" : "TikTok video";
  if (kind === "youtube") return format === "short" ? "YouTube Short" : "YouTube video";
  if (kind === "instagram") return format === "reel" ? "Instagram reel" : "Instagram post";
  if (kind === "note") return "Note";
  if (kind === "video") return "Your video";
  return text(memory.metadata.siteName) ?? hostOf(memory.sourceUrl) ?? "Web page";
}
/** Titles REIBRY generated before real details existed ("TikTok video by @x", a bare hostname, "Video · 15 s"). */
// The title text itself must be a placeholder: a provenance marker alone is not enough (older rows can keep the marker after a real
// title arrived, e.g. "JavaScript | MDN").
function isGenericTitle(memory: Memory) {
  if (memory.sourceType === "video") return /^Video · \d+ s$/.test(memory.title);
  if (memory.sourceType !== "link") return false;
  return memory.title === hostOf(memory.sourceUrl) || /^(?:TikTok|YouTube|Instagram) (?:video|post|reel|Short)(?: by @[\w.]+)?$/i.test(memory.title);
}
export function savedLabel(iso: string, now = new Date()) {
  const date = new Date(iso); if (Number.isNaN(date.getTime())) return "Saved";
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (now.getTime() - date.getTime() < 60_000) return "Saved just now";
  if (days === 0) return "Saved today"; if (days === 1) return "Saved yesterday"; if (days > 1 && days < 7) return `Saved ${days} days ago`;
  return `Saved ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) }).format(date)}`;
}
/** Only an https cover from the platform is shown; anything else falls back to the platform tile. */
export function safeThumbnail(value: JsonValue | undefined) {
  const candidate = text(value); if (!candidate) return null;
  try { const url = new URL(candidate); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
const clamp = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

export function presentMemory(memory: Memory, now = new Date()): MemoryView {
  const kind = kindOf(memory); const kindLabel = kindLabelOf(memory, kind); const platformName = platformNames[kind] ?? (kind === "note" ? "Note" : kind === "video" ? "Your video" : kindLabel);
  const generic = isGenericTitle(memory);
  const creator = kind === "note" ? null : text(memory.metadata.author);
  const caption = text(memory.metadata.caption);
  const sharedText = memory.sourceType === "link" ? text(memory.metadata.sharedText) : null;
  const userNote = memory.sourceType === "text" ? null : text(memory.rawText);
  const video = memory.video ?? null; const analysed = !!(video?.status === "ready" && video.visual);
  let summary: MemoryView["summary"] = null;
  if (caption) summary = { text: clamp(caption, 220), from: `From ${platformName}` };
  else if (sharedText) summary = { text: clamp(sharedText, 220), from: "Shared with the link" };
  else if (analysed && video?.visual?.observations[0]) summary = { text: clamp(video.visual.observations.slice(0, 2).join(". "), 220), from: "From REIBRY's look at your video" };
  else if (memory.sourceType === "text" && memory.rawText) {
    const body = memory.rawText.trim(); const rest = body.startsWith(memory.title) ? body.slice(memory.title.length).trim() : body;
    if (rest) summary = { text: clamp(rest.replace(/\s+/g, " "), 220), from: "Your note" };
  }
  const title = generic ? (kind === "video" ? "Your saved video" : `Saved ${kindLabel}`) : memory.title;
  const enrichment = memory.metadata.enrichment;
  const details: MemoryView["details"] = memory.sourceType !== "link" ? { state: "none", message: null }
    : enrichment === "complete" ? { state: "ready", message: null }
    : enrichment === "pending" || enrichment === undefined ? { state: "pending", message: null }
    : { state: "limited", message: detailsMessage(enrichment, memory.metadata.enrichmentReason) };
  const hashtags = Array.isArray(memory.metadata.hashtags) ? memory.metadata.hashtags.filter((tag): tag is string => typeof tag === "string").slice(0, 4) : [];

  // "What REIBRY knows", by source. Nothing here is inferred by the interface.
  const knows: KnowledgeGroup[] = [];
  if (memory.sourceType === "link") {
    const fromPlatform = [!generic && !isUserTitle(memory) ? `Title: ${memory.title}` : null, creator ? `Creator: ${creator}` : null, caption ? `Caption: ${clamp(caption, 400)}` : null,
      safeThumbnail(memory.metadata.thumbnailUrl) ? "A cover image" : null].filter((item): item is string => !!item);
    if (fromPlatform.length) knows.push({ heading: `Shared by ${platformName}`, items: fromPlatform });
    if (sharedText) knows.push({ heading: "Shared with the link", items: [clamp(sharedText, 400)] });
  }
  if (isUserTitle(memory) || userNote || memory.sourceType === "text") knows.push({ heading: "From you", items: [isUserTitle(memory) || memory.sourceType === "text" ? `Title: ${memory.title}` : null,
    userNote ? `Your note: ${clamp(userNote, 400)}` : null, memory.sourceType === "text" && memory.rawText ? `Your note: ${clamp(memory.rawText, 400)}` : null].filter((item): item is string => !!item) });
  if (analysed && video?.visual) {
    knows.push({ heading: "Seen in your video", items: video.visual.observations.slice(0, 6) });
    if (video.transcript?.text) knows.push({ heading: "Heard in your video", items: [clamp(video.transcript.text, 400)] });
    if (video.visual.interpretations.length) knows.push({ heading: "REIBRY's interpretation (not a fact)", items: video.visual.interpretations.slice(0, 3).map(item => item.claim) });
  }
  const unknown: string[] = [];
  if (memory.sourceType === "link") {
    unknown.push(`What happens in the ${kind === "web" ? "page" : "video"} itself — REIBRY hasn't watched or read it`);
    if (!caption) unknown.push("A caption or description");
    if (!safeThumbnail(memory.metadata.thumbnailUrl)) unknown.push("A cover image");
  }
  if (memory.sourceType === "video" && !analysed) unknown.push("What's in the video — it hasn't been analysed");
  if (analysed && video?.hasAudio && !video.transcript) unknown.push("What's said in the video");
  if (analysed && video?.visual?.gaps.length) unknown.push(...video.visual.gaps.slice(0, 3));

  const originalUrl = memory.sourceType === "link" ? memory.sourceUrl : null;
  return { id: memory.id, href: `/memories/${memory.id}`, kind, kindLabel, platformName, title, titleIsGeneric: generic, creator, summary, note: userNote,
    thumbnail: safeThumbnail(memory.metadata.thumbnailUrl), savedLabel: savedLabel(memory.createdAt, now), savedAt: memory.createdAt,
    originalUrl, openLabel: originalUrl ? (kind === "web" ? "Open page" : `Open on ${platformName}`) : null, hashtags, details, knows: knows.filter(group => group.items.length), unknown, videoAnalysed: analysed };
}
function isUserTitle(memory: Memory) {
  const provenance = memory.metadata.provenance;
  return !!provenance && typeof provenance === "object" && !Array.isArray(provenance) && provenance.title === "user";
}
