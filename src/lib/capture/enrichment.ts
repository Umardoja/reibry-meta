import "server-only";
import { lookup } from "node:dns/promises";
import { parsePublicLink, publicAddress, safeHostname, safeMetadataUrl, type ParsedCaptureUrl } from "./url-policy.ts";

const endpointHosts = new Set(["www.youtube.com", "www.tiktok.com"]);
const tiktokShareHosts = new Set(["vm.tiktok.com", "vt.tiktok.com", "www.tiktok.com", "tiktok.com", "m.tiktok.com"]);
/** Per-host budgets keep a slow provider from delaying the save; capture() also applies an overall cap. */
export const ENRICHMENT_TIMEOUTS_MS = { youtube: 1_200, tiktok: 1_200, tiktokShortLink: 1_000, web: 1_500 } as const;

export type MetadataProvider = "youtube-oembed" | "tiktok-oembed" | "page-metadata" | null;
/** Where each stored fact came from. Provider metadata is never presented as watched video, transcript or AI analysis. */
export type FieldSource = "user" | "url" | "youtube-oembed" | "tiktok-oembed" | "page-metadata" | "reibry-placeholder";
export type MetadataResult = {
  status: "complete" | "partial" | "unavailable" | "unsupported" | "timed-out" | "pending"; provider: MetadataProvider; reason?: string;
  title?: string; author?: string; authorUrl?: string; caption?: string; thumbnailUrl?: string; publishedAt?: string;
  durationSeconds?: number; siteName?: string; canonicalUrl?: string; hashtags?: string[];
  provenance: Partial<Record<"title" | "author" | "caption" | "thumbnailUrl" | "publishedAt" | "durationSeconds" | "siteName", FieldSource>>;
  /** Set when a share link was resolved to the canonical post during enrichment. */
  resolved?: ParsedCaptureUrl;
};
export type AddressResolver = (hostname: string) => Promise<Array<{ address: string }>>;
export type MetadataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type EnrichmentOptions = { fetcher?: MetadataFetch; resolve?: AddressResolver; timeoutMs?: number; maxBytes?: number };

function deadline(timeoutMs: number) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  const expired = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("metadata-timeout")), { once: true }));
  expired.catch(() => {});
  return { signal: controller.signal, expired, done: () => { clearTimeout(timer); controller.abort(); } };
}
async function assertPublicHost(url: URL, resolve: AddressResolver, expired: Promise<never>) {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !safeHostname(url.hostname)) throw new Error("unsafe-url");
  const records = await Promise.race([resolve(url.hostname), expired]);
  if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error("unsafe-address");
}
async function readBounded(response: Response, signal: AbortSignal, maxBytes: number, truncate: boolean) {
  if (!response.body) throw new Error("empty-response");
  const length = Number(response.headers.get("content-length"));
  if (!truncate && Number.isFinite(length) && length > maxBytes) throw new Error("oversized-response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      if (size + value.length > maxBytes) { if (!truncate) { cancel(); throw new Error("oversized-response"); } chunks.push(value.slice(0, maxBytes - size)); size = maxBytes; cancel(); break; }
      size += value.length; chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
const requestInit = (signal: AbortSignal, accept: string): RequestInit => ({ signal, redirect: "manual", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: accept } });

/** Fixed oEmbed endpoints only; redirects are refused. */
export async function fetchVettedJson(endpoint: URL, options: EnrichmentOptions = {}) {
  if (endpoint.protocol !== "https:" || !endpointHosts.has(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.port) throw new Error("untrusted-endpoint");
  const limit = deadline(options.timeoutMs ?? 3_000); const resolve = options.resolve ?? (host => lookup(host, { all: true }));
  try {
    await assertPublicHost(endpoint, resolve, limit.expired);
    const response = await Promise.race([(options.fetcher ?? fetch)(endpoint, requestInit(limit.signal, "application/json")), limit.expired]);
    if (response.status >= 300 && response.status < 400) throw new Error("unsafe-redirect");
    if (!response.ok) throw new Error(`metadata-http-${response.status}`);
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("unsupported-content");
    return JSON.parse(await Promise.race([readBounded(response, limit.signal, options.maxBytes ?? 65_536, false), limit.expired])) as Record<string, unknown>;
  } finally { limit.done(); }
}

/** Public web page for Open Graph / JSON-LD only: every redirect hop is re-validated (HTTPS, public DNS), at most 3 hops. */
export async function fetchVettedPage(start: URL, options: EnrichmentOptions = {}) {
  const limit = deadline(options.timeoutMs ?? ENRICHMENT_TIMEOUTS_MS.web); const resolve = options.resolve ?? (host => lookup(host, { all: true }));
  try {
    let current = start;
    for (let hop = 0; hop <= 3; hop++) {
      await assertPublicHost(current, resolve, limit.expired);
      const response = await Promise.race([(options.fetcher ?? fetch)(current, requestInit(limit.signal, "text/html,application/xhtml+xml")), limit.expired]);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location"); try { await response.body?.cancel(); } catch { /* ignore */ }
        if (!location) throw new Error("unsafe-redirect"); current = new URL(location, current); continue;
      }
      if (response.status === 404 || response.status === 410) throw new Error("not-found");
      if (response.status === 401 || response.status === 403 || response.status === 429) throw new Error("blocked");
      if (!response.ok) throw new Error(`metadata-http-${response.status}`);
      if (!/^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get("content-type") ?? "")) throw new Error("unsupported-content");
      // Metadata lives in <head>; read at most 256 KiB and parse what arrived.
      return { url: current, html: await Promise.race([readBounded(response, limit.signal, options.maxBytes ?? 262_144, true), limit.expired]) };
    }
    throw new Error("too-many-redirects");
  } finally { limit.done(); }
}

/** TikTok share links: follow at most 3 redirects within TikTok hosts until a canonical /@user/video/<id> URL appears. */
export async function resolveTikTokShareLink(link: ParsedCaptureUrl, options: EnrichmentOptions = {}) {
  const limit = deadline(options.timeoutMs ?? ENRICHMENT_TIMEOUTS_MS.tiktokShortLink); const resolve = options.resolve ?? (host => lookup(host, { all: true }));
  try {
    let current = new URL(link.normalized);
    for (let hop = 0; hop < 3; hop++) {
      if (!tiktokShareHosts.has(current.hostname)) throw new Error("unsafe-redirect");
      await assertPublicHost(current, resolve, limit.expired);
      const response = await Promise.race([(options.fetcher ?? fetch)(current, requestInit(limit.signal, "text/html")), limit.expired]);
      try { await response.body?.cancel(); } catch { /* never read share-link bodies */ }
      if (response.status === 404 || response.status === 410) throw new Error("not-found");
      if (response.status < 300 || response.status >= 400) throw new Error("short-link-unresolved");
      const location = response.headers.get("location"); if (!location) throw new Error("short-link-unresolved");
      current = new URL(location, current);
      const parsed = parsePublicLink(current.toString());
      if (parsed.platform === "tiktok" && parsed.postId) return { ...parsed, submitted: link.submitted };
    }
    throw new Error("short-link-unresolved");
  } finally { limit.done(); }
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };
function decode(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (match, code: string) => {
    if (code[0] === "#") { const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10); return Number.isFinite(point) && point > 31 && point < 0x110000 ? String.fromCodePoint(point) : ""; }
    return entities[code.toLowerCase()] ?? match;
  });
}
/** Untrusted provider text: decode entities, drop markup and control characters, collapse whitespace, bound length. */
export function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const text = decode(value).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}
function isoDate(value: unknown) { if (typeof value !== "string") return undefined; const stamp = Date.parse(value); return Number.isFinite(stamp) && stamp > 0 ? new Date(stamp).toISOString() : undefined; }
function isoDuration(value: unknown) {
  if (typeof value !== "string") return undefined; const match = value.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/i); if (!match) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0); return seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}
export function hashtagsFrom(...values: Array<string | undefined>) {
  const tags = new Set<string>();
  for (const value of values) for (const match of (value ?? "").matchAll(/#([\p{L}\p{N}_]{2,40})/gu)) { tags.add(match[1].toLowerCase()); if (tags.size >= 10) return [...tags]; }
  return [...tags];
}
// Login walls and app shells are not real titles.
const genericTitles = /^(?:instagram|login • instagram|tiktok(?: - make your day)?|youtube|facebook|log in|sign in|just a moment\.\.\.|access denied|attention required!.*)$/i;

/** Parse Open Graph, Twitter card, <title>, canonical link and JSON-LD from untrusted HTML. Nothing from the page is rendered. */
export function parsePageMetadata(html: string, pageUrl: string) {
  const meta = new Map<string, string>();
  // Quoted attribute values may legitimately contain ">" so they are consumed whole.
  for (const [tag] of html.matchAll(/<meta\b(?:[^>"']|"[^"]{0,4000}"|'[^']{0,4000}')*>/gi)) {
    const attrs = new Map<string, string>();
    for (const attr of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.set(attr[1].toLowerCase(), attr[2] ?? attr[3] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop"))?.toLowerCase(); const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const ld: Record<string, unknown>[] = [];
  for (const [, block] of [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{0,50000}?)<\/script>/gi)].slice(0, 5)) {
    try { const parsed = JSON.parse(block); const queue = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of queue) { if (item && typeof item === "object") { ld.push(item as Record<string, unknown>); const graph = (item as Record<string, unknown>)["@graph"]; if (Array.isArray(graph)) ld.push(...graph.filter(node => node && typeof node === "object") as Record<string, unknown>[]); } }
    } catch { /* ignore malformed JSON-LD */ }
  }
  const typed = ld.find(item => /VideoObject|Article|BlogPosting|NewsArticle|Recipe|HowTo|SocialMediaPosting/.test(String(item["@type"]))) ?? ld[0] ?? {};
  const name = (value: unknown) => typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>).name : Array.isArray(value) ? (value[0] as Record<string, unknown>)?.name : undefined;
  const image = (value: unknown): unknown => typeof value === "string" ? value : Array.isArray(value) ? image(value[0]) : value && typeof value === "object" ? (value as Record<string, unknown>).url : undefined;
  const titleTag = html.match(/<title\b[^>]*>([\s\S]{0,600}?)<\/title>/i)?.[1];
  const canonical = html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  let title = cleanText(meta.get("og:title") ?? meta.get("twitter:title") ?? typed.headline ?? typed.name ?? titleTag, 200);
  if (title && genericTitles.test(title)) title = undefined;
  const caption = cleanText(meta.get("og:description") ?? meta.get("twitter:description") ?? typed.description ?? meta.get("description"), 1_000);
  const authorMeta = meta.get("author") ?? (meta.get("article:author")?.startsWith("http") ? undefined : meta.get("article:author"));
  const keywords = cleanText(Array.isArray(typed.keywords) ? typed.keywords.join(" ") : typed.keywords ?? meta.get("keywords"), 400);
  return {
    title, caption,
    author: cleanText(authorMeta ?? name(typed.author) ?? name(typed.creator), 120),
    thumbnailUrl: safeMetadataUrl(meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("twitter:image") ?? image(typed.thumbnailUrl ?? typed.image), pageUrl) ?? undefined,
    siteName: cleanText(meta.get("og:site_name"), 80),
    publishedAt: isoDate(meta.get("article:published_time") ?? typed.uploadDate ?? typed.datePublished ?? meta.get("og:video:release_date")),
    durationSeconds: isoDuration(typed.duration ?? meta.get("video:duration")),
    canonicalUrl: safeMetadataUrl(canonical ?? meta.get("og:url"), pageUrl) ?? undefined,
    hashtags: hashtagsFrom(caption, title, keywords?.split(/[,\s]+/).map(word => `#${word}`).join(" ")),
  };
}

function failureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "metadata-timeout") return "provider-timeout";
  if (message === "not-found" || /^metadata-http-(?:400|404|410)$/.test(message)) return "not-found-or-private";
  if (message === "blocked" || /^metadata-http-(?:401|403|429)$/.test(message)) return "provider-blocked";
  if (["unsafe-url", "unsafe-address", "unsafe-redirect", "untrusted-endpoint", "too-many-redirects"].includes(message)) return "unsafe-destination";
  if (message === "unsupported-content") return "not-a-web-page";
  if (message === "short-link-unresolved") return "share-link-unresolved";
  return "provider-error";
}

export async function enrichLink(link: ParsedCaptureUrl, options: EnrichmentOptions = {}): Promise<MetadataResult> {
  if (link.platform === "instagram")
    // Instagram's sanctioned oEmbed requires a Meta app access token; the public page is login-walled. Never scraped.
    return { status: "unavailable", provider: null, reason: "instagram-requires-meta-app-token", provenance: {} };
  if (link.platform === "web") {
    try {
      const page = await fetchVettedPage(new URL(link.normalized), options);
      const found = parsePageMetadata(page.html, page.url.toString());
      const provenance: MetadataResult["provenance"] = {};
      for (const field of ["title", "caption", "author", "thumbnailUrl", "publishedAt", "durationSeconds", "siteName"] as const) if (found[field] !== undefined) provenance[field] = "page-metadata";
      const status = found.title && (found.caption || found.thumbnailUrl) ? "complete" : found.title || found.caption ? "partial" : "unavailable";
      return { status, provider: "page-metadata", ...(status === "unavailable" ? { reason: "no-page-metadata" } : {}), ...found, provenance };
    } catch (error) { return { status: "unavailable", provider: "page-metadata", reason: failureReason(error), provenance: {} }; }
  }
  let target = link; let resolved: ParsedCaptureUrl | undefined;
  if (link.platform === "tiktok" && link.shortLink) {
    try { resolved = await resolveTikTokShareLink(link, { ...options, timeoutMs: options.timeoutMs ?? ENRICHMENT_TIMEOUTS_MS.tiktokShortLink }); target = resolved; }
    catch (error) { return { status: "unavailable", provider: "tiktok-oembed", reason: failureReason(error), provenance: {} }; }
  }
  const provider = link.platform === "youtube" ? "youtube-oembed" : "tiktok-oembed";
  const endpoint = new URL(link.platform === "youtube" ? "https://www.youtube.com/oembed" : "https://www.tiktok.com/oembed");
  endpoint.searchParams.set("url", target.normalized); if (link.platform === "youtube") endpoint.searchParams.set("format", "json");
  const base = { provider, ...(resolved ? { resolved } : {}) } as const;
  try {
    const data = await fetchVettedJson(endpoint, { ...options, timeoutMs: options.timeoutMs ?? ENRICHMENT_TIMEOUTS_MS[link.platform === "youtube" ? "youtube" : "tiktok"] });
    const provenance: MetadataResult["provenance"] = {};
    const title = cleanText(data.title, 200); const thumbnailUrl = safeMetadataUrl(data.thumbnail_url) ?? undefined;
    let author = cleanText(data.author_name, 120);
    if (title) provenance.title = provider; if (thumbnailUrl) provenance.thumbnailUrl = provider; if (author) provenance.author = provider;
    if (!author && target.creatorHandle) { author = target.creatorHandle; provenance.author = "url"; }
    // TikTok's current oEmbed often returns only a player iframe: the post exists, but title/caption/thumbnail are not supplied.
    return { ...base, status: title ? "complete" : "partial", ...(title ? {} : { reason: "provider-returned-no-title" }), title, author,
      authorUrl: safeMetadataUrl(data.author_url) ?? undefined, thumbnailUrl, hashtags: hashtagsFrom(title), provenance };
  } catch (error) {
    const provenance: MetadataResult["provenance"] = target.creatorHandle ? { author: "url" } : {};
    return { ...base, status: "unavailable", reason: failureReason(error), ...(target.creatorHandle ? { author: target.creatorHandle } : {}), provenance };
  }
}
