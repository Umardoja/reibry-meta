import "server-only";
import { cleanText, type MetadataResult } from "./enrichment.ts";
import { parsePublicLink, safeMetadataUrl, type ParsedCaptureUrl } from "./url-policy.ts";

const ENDPOINT = "https://api.supadata.ai/v1/metadata";
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 65_536;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tagPattern = /^[\p{L}\p{N}_]{2,40}$/u;

export type SupadataDependencies = { env: Record<string, string | undefined>; fetch: typeof fetch; timeoutMs?: number };
export type SupadataMetadataFetcher = (link: ParsedCaptureUrl, ownerId: string) => Promise<MetadataResult | null>;
const defaultDependencies: SupadataDependencies = { env: process.env, fetch };

/** Default-off, exact-user private-development gate. It is never a general capture fallback. */
export function supadataGate(ownerId: string, env: Record<string, string | undefined>) {
  const key = env.SUPADATA_API_KEY?.trim() ?? "";
  const allowedUser = env.SUPADATA_DEV_USER_ID?.trim() ?? "";
  return env.SUPADATA_DEV_ENABLED === "true" && key.length >= 16 && userIdPattern.test(allowedUser) && ownerId === allowedUser;
}

function failure(reason: string): MetadataResult {
  return { status: "unavailable", provider: "supadata-unverified", reason, provenance: {} };
}
function responseReason(status: number) {
  if (status === 403) return "supadata-forbidden";
  if (status === 404) return "supadata-not-found";
  if (status === 429) return "supadata-rate-limited";
  return "supadata-unavailable";
}
function boundedTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const tags = new Set<string>();
  for (const item of value) {
    const tag = cleanText(typeof item === "string" ? item.replace(/^#/, "") : item, 40)?.normalize("NFKC");
    if (tag && tagPattern.test(tag)) tags.add(tag.toLocaleLowerCase("en"));
    if (tags.size === 10) break;
  }
  return [...tags];
}
function date(value: unknown) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
function displayTitle(link: ParsedCaptureUrl, description: string | undefined, providerTitle: string | undefined) {
  if (providerTitle) return providerTitle;
  if (!description) return undefined;
  const excerpt = description.split(/[.!?]\s/, 1)[0].trim().slice(0, 150);
  return excerpt ? `Saved ${link.platform === "instagram" ? "Instagram" : "TikTok"} details: ${excerpt}`.slice(0, 200) : undefined;
}
async function readJson(response: Response, signal: AbortSignal) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("response-too-large");
  if (!response.body) throw new Error("response-empty");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > MAX_RESPONSE_BYTES) { cancel(); throw new Error("response-too-large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>; } catch { throw new Error("invalid-json"); }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

/** Parses only bounded, display-safe metadata. Returned fields remain expressly unverified external metadata. */
export function parseSupadataMetadata(link: ParsedCaptureUrl, value: unknown): MetadataResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure("supadata-invalid-response");
  const data = value as Record<string, unknown>;
  if (data.platform !== link.platform || typeof data.url !== "string" || typeof data.id !== "string") return failure("supadata-mismatched-source");
  let returned: ParsedCaptureUrl;
  try { returned = parsePublicLink(data.url); } catch { return failure("supadata-mismatched-source"); }
  if (returned.platform !== link.platform || returned.identity !== link.identity || (link.postId && data.id !== link.postId)) return failure("supadata-mismatched-source");
  const description = cleanText(data.description, 1_000); const providerTitle = cleanText(data.title, 200);
  const authorRecord = data.author && typeof data.author === "object" && !Array.isArray(data.author) ? data.author as Record<string, unknown> : {};
  const username = cleanText(authorRecord.username, 80)?.replace(/^@/, ""); const displayName = cleanText(authorRecord.displayName, 100);
  const author = displayName && username ? `${displayName} (@${username})`.slice(0, 120) : displayName ?? (username ? `@${username}` : undefined);
  const media = data.media && typeof data.media === "object" && !Array.isArray(data.media) ? data.media as Record<string, unknown> : {};
  const thumbnailUrl = safeMetadataUrl(media.thumbnailUrl) ?? undefined;
  const title = displayTitle(link, description, providerTitle); const hashtags = boundedTags(data.tags); const publishedAt = date(data.createdAt);
  const provenance: MetadataResult["provenance"] = {};
  if (title) provenance.title = "supadata-unverified";
  if (description) provenance.caption = "supadata-unverified";
  if (author) provenance.author = "supadata-unverified";
  if (thumbnailUrl) provenance.thumbnailUrl = "supadata-unverified";
  if (publishedAt) provenance.publishedAt = "supadata-unverified";
  const useful = !!(title || description || author || thumbnailUrl || hashtags.length || publishedAt);
  return { status: description || thumbnailUrl || title ? "complete" : useful ? "partial" : "unavailable", provider: "supadata-unverified",
    ...(useful ? {} : { reason: "supadata-empty-response" }), title, caption: description, author, thumbnailUrl, hashtags, publishedAt, canonicalUrl: returned.normalized, provenance };
}

/** Calls one fixed vendor endpoint only after the exact authenticated development user passed the default-off gate. No retry. */
export function createSupadataMetadataFetcher(dependencies: SupadataDependencies = defaultDependencies): SupadataMetadataFetcher {
  return async (link, ownerId) => {
    if (!supadataGate(ownerId, dependencies.env) || !["tiktok", "instagram"].includes(link.platform) || !link.postId || link.shortLink) return null;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? TIMEOUT_MS);
    try {
      const url = new URL(ENDPOINT); url.searchParams.set("url", link.normalized);
      const response = await dependencies.fetch(url, { method: "GET", redirect: "manual", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        signal: controller.signal, headers: { Accept: "application/json", "x-api-key": dependencies.env.SUPADATA_API_KEY! } });
      if (response.status >= 300 && response.status < 400) return failure("supadata-unsafe-redirect");
      if (!response.ok) return failure(responseReason(response.status));
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("supadata-invalid-response");
      return parseSupadataMetadata(link, await readJson(response, controller.signal));
    } catch (error) { return failure(error instanceof Error && error.name === "AbortError" ? "supadata-timeout" : "supadata-unavailable"); }
    finally { clearTimeout(timer); controller.abort(); }
  };
}
