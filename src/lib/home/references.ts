// Stage 12I-1B: deterministic resolution of WHICH saved Memory the user means, before Muse is called.
// Every Memory here was read through the owner-bound repository; client references are hints that were already re-validated.
import type { Memory } from "../memory/contracts.ts";
import type { RetrievalItem } from "../retrieval/contracts.ts";
import { memoryEvidenceItem, normalizeQuery, rankMemories } from "../retrieval/service.ts";

export type ReferenceHint = "user-selected-shown-position" | "named-in-message" | "saved-in-requested-period" | "most-recently-saved-match" |
  "most-recently-saved-overall" | "referred-to-in-conversation";
export type ResolvedEvidence = { items: RetrievalItem[]; shownEarlier: Map<string, number>; resolution: string | null };
/** referenced: Memories shown in the previous reply, re-read for this user, with the 1-based position the user saw them in. */
type Input = { message: string; priorUserText: string | undefined; candidates: Memory[]; referenced: Array<{ memory: Memory; position: number }>; now: Date;
  timezone: string; limit: number };

// Single filler-term matches are noise when a much stronger match exists ("plan" also matching an unrelated "Study plan").
export function relevant(items: RetrievalItem[]) { const top = items[0]?.match.score ?? 0; return items.filter(item => item.match.score >= top * 0.4); }

const ORDINALS: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, sixth: 6, "6th": 6 };
const ordinalCue = /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|last)\s+(?:one|item|video|link|post|course|note|memory)\b|\b(?:number|no\.?|#)\s*([1-6])\b/i;
const recencyCue = /\bjust\s+(?:saved|shared|captured|added|sent|posted)\b|\b(?:recently|latest|newest|most\s+recent(?:ly)?)\b|\blast\s+(?:thing|one|video|link|post|course|memory)\s+i\s+(?:saved|shared|captured|added)\b|\b(?:a\s+(?:minute|moment|few\s+minutes)\s+ago|earlier\s+today)\b/i;
const periodCue = /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month)\b/i;
const anaphoraCue = /\b(?:that|this|the\s+same)\s+(?:one|video|link|post|course|thing|note|memory|item|reel|clip|tutorial)\b|\b(?:it|that|this)\s*[?.!]*$/i;
// Words that describe a saved item without identifying it: they must not outrank the item already under discussion.
const GENERIC = new Set(("video videos clip clips reel reels post posts link links course courses tutorial thing things one ones note notes memory memories item " +
  "items stuff actually really exactly more info information details detail what which").split(" "));

/** Same saved item captured more than once (pre-12I duplicates, share-link variants): grouped for the model, identities kept. */
function identity(memory: Memory) {
  const platform = typeof memory.metadata.platform === "string" ? memory.metadata.platform : null;
  if (platform && typeof memory.metadata.postId === "string" && memory.metadata.postId) return `${platform}:${memory.metadata.postId}`;
  const raw = [memory.metadata.canonicalUrl, memory.metadata.normalizedUrl, memory.sourceUrl].find(value => typeof value === "string" && value) as string | undefined;
  if (raw) { try { const url = new URL(raw); const host = url.hostname.replace(/^(?:www|m)\./, "");
    if (host === "youtube.com" && url.searchParams.get("v")) return `youtube:${url.searchParams.get("v")}`;
    if (host === "youtu.be" && url.pathname.length > 1) return `youtube:${url.pathname.slice(1).split("/")[0]}`;
    const tiktok = /\/video\/(\d+)/.exec(url.pathname); if (host.endsWith("tiktok.com") && tiktok) return `tiktok:${tiktok[1]}`;
    return `url:${host}${url.pathname.replace(/\/+$/, "")}`; } catch { /* fall through */ } }
  if (memory.sourceType === "text") return `text:${normalizeQuery(memory.title).phrase}|${normalizeQuery(memory.rawText ?? "").phrase}`;
  return `id:${memory.id}`;
}

function localDay(value: Date, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function shiftDay(day: string, days: number) { const date = new Date(`${day}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
/** Inclusive local-calendar window for "last month", "this week" etc. in the user's timezone (weeks start Monday). */
export function savedPeriod(cue: string, now: Date, timezone: string) {
  const today = localDay(now, timezone); const weekday = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7; const key = cue.toLowerCase().replace(/\s+/g, " ");
  const month = (offset: number) => { const date = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`); date.setUTCMonth(date.getUTCMonth() + offset);
    const from = date.toISOString().slice(0, 10); date.setUTCMonth(date.getUTCMonth() + 1); return { from, to: shiftDay(date.toISOString().slice(0, 10), -1) }; };
  const window = key === "today" ? { from: today, to: today } : key === "yesterday" ? { from: shiftDay(today, -1), to: shiftDay(today, -1) }
    : key === "this week" ? { from: shiftDay(today, -weekday), to: today } : key === "last week" ? { from: shiftDay(today, -weekday - 7), to: shiftDay(today, -weekday - 1) }
    : key === "this month" ? { from: `${today.slice(0, 7)}-01`, to: today } : month(-1);
  return { label: key, ...window };
}

function creatorTerms(memory: Memory) { return typeof memory.metadata.author === "string" ? normalizeQuery(memory.metadata.author.replace(/^@/, "")).terms : []; }
function isPlaceholderTitle(memory: Memory) { const provenance = memory.metadata.provenance; return !!provenance && typeof provenance === "object" && !Array.isArray(provenance) && provenance.title === "reibry-placeholder"; }

export function resolveConversationEvidence(input: Input): ResolvedEvidence {
  const referenced = input.referenced.map(entry => entry.memory); const shownEarlier = new Map(input.referenced.map(entry => [entry.memory.id, entry.position]));
  const groupOf = new Map<string, string>(); const members = new Map<string, Memory[]>();
  for (const memory of [...referenced, ...input.candidates]) { if (groupOf.has(memory.id)) continue; const key = identity(memory); groupOf.set(memory.id, key);
    members.set(key, [...(members.get(key) ?? []), memory]); }
  // A copy picked for its own date ("from last month") or the copy the user was shown stays the cited identity; otherwise the newest copy.
  const chosen = new Map<string, Memory>();
  const representative = (key: string) => { const group = members.get(key)!; return chosen.get(key) ?? group.find(memory => shownEarlier.has(memory.id)) ??
    [...group].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]; };
  const message = normalizeQuery(input.message); const words = new Set(message.phrase.split(" "));
  const ranked = (query: string) => relevant(rankMemories(input.candidates, query, 20).items);
  // Reference words ("last month", "just saved", "the second one") locate a Memory; they are not words to search its content for.
  const lexical = ranked(input.message.replace(periodCue, " ").replace(recencyCue, " ").replace(ordinalCue, " "));
  const hints = new Map<string, ReferenceHint>(); const ordered: Array<RetrievalItem | Memory> = []; let resolution: string | null = null;
  const hinted = (memory: Memory, hint: ReferenceHint) => { const rep = representative(groupOf.get(memory.id)!); if (!hints.has(rep.id)) hints.set(rep.id, hint); ordered.push(rep); };

  const ordinal = recencyCue.test(input.message) ? null : ordinalCue.exec(input.message);
  const position = !ordinal ? 0 : ordinal[1]?.toLowerCase() === "last" ? Math.max(0, ...shownEarlier.values()) : ORDINALS[ordinal[1]?.toLowerCase() ?? ""] ?? Number(ordinal[2]);
  const selected = input.referenced.find(entry => entry.position === position)?.memory;
  // "the Mosh one": the user's words contain the whole creator name, or a creator word no other saved item's creator or title shares.
  const groupWords = new Map([...members.keys()].map(key => { const rep = representative(key); return [key, new Set([...creatorTerms(rep), ...normalizeQuery(rep.title).terms])]; }));
  const named = [...members.keys()].filter(key => { const rep = representative(key); const terms = creatorTerms(rep);
    const title = isPlaceholderTitle(rep) ? "" : normalizeQuery(rep.title).phrase;
    if (title.length > 8 && message.phrase.includes(title)) return true; if (!terms.length) return false; if (terms.length >= 2 && terms.every(term => words.has(term))) return true;
    return terms.some(term => term.length >= 4 && !GENERIC.has(term) && words.has(term) && [...groupWords].every(([other, set]) => other === key || !set.has(term))); });
  const period = periodCue.exec(input.message);

  if (selected) {
    hinted(selected, "user-selected-shown-position"); resolution = `shown-position:${position}`;
  } else if (named.length) {
    for (const key of named.sort((a, b) => Date.parse(representative(b).createdAt) - Date.parse(representative(a).createdAt))) hinted(representative(key), "named-in-message");
    resolution = named.length === 1 ? "named" : "named:several";
  } else if (period) {
    const window = savedPeriod(period[1], input.now, input.timezone);
    const inside = lexical.filter(item => { const day = localDay(new Date(item.savedAt ?? 0), input.timezone); return day >= window.from && day <= window.to; });
    for (const item of inside) { const key = groupOf.get(item.memoryId)!; if (!chosen.has(key)) chosen.set(key, members.get(key)!.find(memory => memory.id === item.memoryId)!);
      hinted(representative(key), "saved-in-requested-period"); }
    resolution = `saved-period:${window.label}:${window.from}..${window.to}${inside.length ? "" : ":none-matched"}`;
  } else if (recencyCue.test(input.message)) {
    const newestMatch = [...lexical].sort((a, b) => Date.parse(b.savedAt ?? "") - Date.parse(a.savedAt ?? ""))[0];
    if (newestMatch) hinted(representative(groupOf.get(newestMatch.memoryId)!), "most-recently-saved-match");
    // A just-captured Memory may only have a placeholder title ("YouTube video") and match nothing: offer the newest save too.
    const newest = [...input.candidates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (newest && input.now.getTime() - Date.parse(newest.createdAt) <= 7 * 86_400_000) hinted(newest, "most-recently-saved-overall");
    resolution = newestMatch ? "most-recent-match" : newest ? "most-recent-overall" : null;
  } else if (referenced.length && anaphoraCue.test(input.message) && !message.terms.some(term => !GENERIC.has(term))) {
    // "What do you know about that video?": the item under discussion, not every saved item that happens to contain "video".
    if (referenced.length === 1) hinted(referenced[0], "referred-to-in-conversation");
    const items = referenced.map(memory => withGroup(memoryEvidenceItem(memory), hints, members, groupOf));
    return { items: items.slice(0, input.limit), shownEarlier, resolution: referenced.length === 1 ? "conversation" : "ambiguous-conversation" };
  }

  const prior = lexical.length < 2 && input.priorUserText ? ranked(`${input.priorUserText} ${input.message}`) : [];
  const shown = referenced.map(memory => memoryEvidenceItem(memory));
  const merged = new Map<string, RetrievalItem>();
  const byId = new Map([...lexical, ...prior, ...shown].map(item => [item.memoryId, item]));
  for (const entry of [...ordered, ...lexical.slice(0, 3), ...shown, ...lexical.slice(3), ...prior]) {
    const rep = representative(groupOf.get("memoryId" in entry ? entry.memoryId : entry.id)!); if (merged.has(rep.id)) continue;
    merged.set(rep.id, withGroup(byId.get(rep.id) ?? memoryEvidenceItem(rep, hints.has(rep.id) ? referenceReason(hints.get(rep.id)!) : undefined), hints, members, groupOf));
  }
  return { items: [...merged.values()].slice(0, input.limit), shownEarlier, resolution };
}
function referenceReason(hint: ReferenceHint) {
  return hint === "most-recently-saved-overall" ? "The most recently saved Memory." : hint === "named-in-message" ? "The creator or title named in this message." : "Resolved from this conversation.";
}
function withGroup(item: RetrievalItem, hints: Map<string, ReferenceHint>, members: Map<string, Memory[]>, groupOf: Map<string, string>): RetrievalItem {
  return { ...item, referenceHint: hints.get(item.memoryId) ?? null, timesSaved: members.get(groupOf.get(item.memoryId)!)?.length ?? 1 };
}
