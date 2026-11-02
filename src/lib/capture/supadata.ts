import "server-only";
import { cleanText, type MetadataResult } from "./enrichment.ts";
import { parsePublicLink, safeMetadataUrl, type ParsedCaptureUrl } from "./url-policy.ts";

const ENDPOINT = "https://api.supadata.ai/v1/metadata";
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 65_536;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tagPattern = /^[\p{L}\p{N}_]{2,40}$/u;
// This private pilot is intentionally pinned in code as well as configuration. A changed environment value cannot widen it.
const approvedPilotIdentities = new Set([
  "tiktok:7696611605374602518",
  "tiktok:7702502616080829717",
  "instagram:DOGnqc1DlIy",
  "instagram:Dd6nk3hNS7l",
]);

export type SupadataDependencies = { env: Record<string, string | undefined>; fetch: typeof fetch; timeoutMs?: number };
export type SupadataMetadataFetcher = (link: ParsedCaptureUrl, ownerId: string, signal?: AbortSignal) => Promise<MetadataResult | null>;
export type SupadataDiagnosticFetcher = (link: ParsedCaptureUrl, ownerId: string, signal?: AbortSignal) => Promise<{ metadata: MetadataResult | null; diagnostic: SupadataPilotSourceDiagnostic | null } | null>;
/** Safe, field-free source-check categories for an owner-approved future diagnostic call. Never logged automatically. */
export type SupadataSourceMatchDiagnostic = "platform" | "missing-url" | "missing-id" | "malformed-url" | "url-platform" | "url-identity" | "id";
export type SupadataPilotSourceDiagnostic = {
  approvedIdentity: string; returnedPlatform: string | "missing" | "other"; returnedIdFormat: "numeric" | "shortcode" | "missing" | "other";
  returnedUrlHostPath: string | "missing" | "malformed" | "credentialed"; condition: SupadataSourceMatchDiagnostic | null;
  returnedIdRepresentation: "shortcode" | "numeric-media-id" | "numeric-other" | "unrecognized" | "missing";
  returnedUrlIdentity: "exact" | "shortcode-mismatch" | "missing" | "malformed" | "wrong-platform" | "unrecognized";
  identityFields: "verified" | "contradictory" | "incomplete" | "unverified";
  descriptionPresent: boolean; creatorPresent: boolean; tagsPresent: boolean; thumbnailPresent: boolean;
};
const defaultDependencies: SupadataDependencies = { env: process.env, fetch };

/** Default-off, exact-user private-development gate. It is never a general capture fallback. */
export function supadataGate(ownerId: string, env: Record<string, string | undefined>) {
  const key = env.SUPADATA_API_KEY?.trim() ?? "";
  const allowedUser = env.SUPADATA_DEV_USER_ID?.trim() ?? "";
  return env.SUPADATA_DEV_ENABLED === "true" && key.length >= 16 && userIdPattern.test(allowedUser) && ownerId === allowedUser;
}
function configuredPilotIdentities(env: Record<string, string | undefined>) {
  const raw = env.SUPADATA_DEV_ALLOWED_CANONICAL_IDS;
  if (!raw || raw.length > 512) return null;
  const values = raw.split(",").map(value => value.trim());
  if (!values.length || values.some(value => !/^(tiktok:\d{10,25}|instagram:[A-Za-z0-9_-]{5,64})$/.test(value))) return null;
  const configured = new Set(values);
  if (configured.size !== approvedPilotIdentities.size || values.length !== configured.size) return null;
  return [...approvedPilotIdentities].every(value => configured.has(value)) ? configured : null;
}
/** Requires both the exact disposable user and the four hard-pinned canonical pilot identities. */
export function supadataPilotAllows(ownerId: string, link: ParsedCaptureUrl, env: Record<string, string | undefined>) {
  const configured = configuredPilotIdentities(env);
  return supadataGate(ownerId, env) && !link.shortLink && !!link.postId && !!configured && configured.has(link.identity);
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

type SourceMatch = { returned: ParsedCaptureUrl; diagnostic: null } | { returned: null; diagnostic: SupadataSourceMatchDiagnostic };

const instagramShortcodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const instagramShortcodePattern = /^[A-Za-z0-9_-]{5,64}$/;
/**
 * Instagram shortcodes are a base-64 representation of the legacy media ID.
 * This is used only as an additional strict equivalence check; provider URLs still
 * must independently resolve to the exact saved shortcode. BigInt avoids Number
 * precision loss for large legacy media IDs.
 */
export function instagramShortcodeToMediaId(shortcode: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shortcode)) return null;
  let mediaId = BigInt(0);
  for (const character of shortcode) {
    const digit = instagramShortcodeAlphabet.indexOf(character);
    if (digit < 0) return null;
    mediaId = (mediaId * BigInt(64)) + BigInt(digit);
  }
  return mediaId.toString();
}

function equivalentProviderId(link: ParsedCaptureUrl, providerId: string) {
  if (!link.postId) return false;
  if (providerId === link.postId) return true;
  return link.platform === "instagram" && /^\d{5,25}$/.test(providerId)
    && instagramShortcodeToMediaId(link.postId) === providerId;
}

function exactInstagramShortcode(link: ParsedCaptureUrl, providerId: string) {
  return link.platform === "instagram" && !!link.postId && instagramShortcodePattern.test(providerId) && providerId === link.postId;
}

function sourceMatch(link: ParsedCaptureUrl, data: Record<string, unknown>): SourceMatch {
  if (data.platform !== link.platform) return { returned: null, diagnostic: "platform" };
  if (typeof data.id !== "string") return { returned: null, diagnostic: "missing-id" };
  // A live, one-shot TikTok response on 2026-11-02 had the documented platform and exact numeric video ID but omitted url.
  // A live Instagram response used the exact saved shortcode but omitted url. In either narrowly scoped case,
  // the pre-validated canonical owner Memory supplies the URL. The fetcher still requires the exact owner and
  // four-item pilot allowlist; the trusted writer re-checks the locked owned link Memory before persistence.
  if (data.url === undefined) {
    if (link.platform === "tiktok" && link.postId && data.id === link.postId) return { returned: link, diagnostic: null };
    if (exactInstagramShortcode(link, data.id)) return { returned: link, diagnostic: null };
    return { returned: null, diagnostic: link.postId && data.id !== link.postId ? "id" : "missing-url" };
  }
  if (data.url === null) {
    if (exactInstagramShortcode(link, data.id)) return { returned: link, diagnostic: null };
    return { returned: null, diagnostic: link.postId && data.id !== link.postId ? "id" : "missing-url" };
  }
  if (typeof data.url !== "string") return { returned: null, diagnostic: "missing-url" };
  let returned: ParsedCaptureUrl;
  try { returned = parsePublicLink(data.url); } catch { return { returned: null, diagnostic: "malformed-url" }; }
  if (returned.platform !== link.platform) return { returned: null, diagnostic: "url-platform" };
  if (returned.identity !== link.identity) return { returned: null, diagnostic: "url-identity" };
  if (link.postId && !equivalentProviderId(link, data.id)) return { returned: null, diagnostic: "id" };
  return { returned, diagnostic: null };
}

/**
 * Returns a bounded category only. It deliberately omits provider URLs, IDs, text and account data,
 * so it can be used by a future explicitly authorized server-only diagnostic without retaining a raw response.
 */
export function diagnoseSupadataSourceMatch(link: ParsedCaptureUrl, value: unknown): SupadataSourceMatchDiagnostic | "invalid-envelope" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "invalid-envelope";
  return sourceMatch(link, value as Record<string, unknown>).diagnostic;
}

function diagnosticPlatform(value: unknown): SupadataPilotSourceDiagnostic["returnedPlatform"] {
  return typeof value !== "string" ? "missing" : /^(youtube|tiktok|instagram|twitter|facebook)$/.test(value) ? value : "other";
}
function diagnosticIdFormat(value: unknown): SupadataPilotSourceDiagnostic["returnedIdFormat"] {
  if (typeof value !== "string") return "missing";
  if (/^\d{5,25}$/.test(value)) return "numeric";
  return /^[A-Za-z0-9_-]{5,64}$/.test(value) ? "shortcode" : "other";
}
function diagnosticIdRepresentation(link: ParsedCaptureUrl, value: unknown): SupadataPilotSourceDiagnostic["returnedIdRepresentation"] {
  if (typeof value !== "string") return "missing";
  if (/^\d{5,25}$/.test(value)) return link.platform === "instagram" && link.postId && instagramShortcodeToMediaId(link.postId) === value
    ? "numeric-media-id" : "numeric-other";
  return /^[A-Za-z0-9_-]{5,64}$/.test(value) && value === link.postId ? "shortcode" : "unrecognized";
}
function diagnosticUrlHostPath(value: unknown): SupadataPilotSourceDiagnostic["returnedUrlHostPath"] {
  if (typeof value !== "string") return "missing";
  try { const url = new URL(value); if (url.username || url.password) return "credentialed"; return `${url.hostname.toLowerCase()}${url.pathname}`.slice(0, 256); }
  catch { return "malformed"; }
}
function diagnosticUrlIdentity(link: ParsedCaptureUrl, value: unknown): SupadataPilotSourceDiagnostic["returnedUrlIdentity"] {
  if (typeof value !== "string") return "missing";
  try {
    const returned = parsePublicLink(value);
    if (returned.platform !== link.platform) return "wrong-platform";
    return returned.identity === link.identity ? "exact" : "shortcode-mismatch";
  } catch { return "malformed"; }
}
function diagnosticIdentityFields(link: ParsedCaptureUrl, data: Record<string, unknown>, urlIdentity: SupadataPilotSourceDiagnostic["returnedUrlIdentity"]): SupadataPilotSourceDiagnostic["identityFields"] {
  if (typeof data.id !== "string") return "incomplete";
  if (urlIdentity === "missing") return exactInstagramShortcode(link, data.id) && (data.url === undefined || data.url === null) ? "verified" : "incomplete";
  if (urlIdentity === "malformed") return "incomplete";
  if (urlIdentity === "shortcode-mismatch" && equivalentProviderId(link, data.id)) return "contradictory";
  if (urlIdentity !== "exact") return "unverified";
  return equivalentProviderId(link, data.id) ? "verified" : "contradictory";
}

/**
 * Disabled unless the exact owner, allowlist and SUPADATA_DEV_DIAGNOSTICS=true all pass. This makes no network request and never logs.
 * It intentionally returns only source-shape facts—never provider text, thumbnails, credentials, query strings or raw payloads.
 */
export function pilotSupadataSourceDiagnostic(ownerId: string, link: ParsedCaptureUrl, value: unknown, env: Record<string, string | undefined>): SupadataPilotSourceDiagnostic | null {
  if (env.SUPADATA_DEV_DIAGNOSTICS !== "true" || !supadataPilotAllows(ownerId, link, env) || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>; const media = data.media && typeof data.media === "object" && !Array.isArray(data.media) ? data.media as Record<string, unknown> : {};
  const urlIdentity = diagnosticUrlIdentity(link, data.url);
  return { approvedIdentity: link.identity, returnedPlatform: diagnosticPlatform(data.platform), returnedIdFormat: diagnosticIdFormat(data.id),
    returnedUrlHostPath: diagnosticUrlHostPath(data.url), condition: sourceMatch(link, data).diagnostic,
    returnedIdRepresentation: diagnosticIdRepresentation(link, data.id), returnedUrlIdentity: urlIdentity,
    identityFields: diagnosticIdentityFields(link, data, urlIdentity), descriptionPresent: typeof data.description === "string" && data.description.trim().length > 0,
    creatorPresent: !!(data.author && typeof data.author === "object" && !Array.isArray(data.author)), tagsPresent: Array.isArray(data.tags) && data.tags.length > 0,
    thumbnailPresent: typeof media.thumbnailUrl === "string" && media.thumbnailUrl.trim().length > 0 };
}

/** Parses only bounded, display-safe metadata. Returned fields remain expressly unverified external metadata. */
export function parseSupadataMetadata(link: ParsedCaptureUrl, value: unknown): MetadataResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure("supadata-invalid-response");
  const data = value as Record<string, unknown>;
  const matched = sourceMatch(link, data);
  if (!matched.returned) return failure("supadata-mismatched-source");
  const returned = matched.returned;
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
  return async (link, ownerId, requestSignal) => {
    if (!supadataPilotAllows(ownerId, link, dependencies.env)) return null;
    if (requestSignal?.aborted) return failure("supadata-timeout");
    const controller = new AbortController(); const cancel = () => controller.abort();
    requestSignal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, dependencies.timeoutMs ?? TIMEOUT_MS);
    try {
      const url = new URL(ENDPOINT); url.searchParams.set("url", link.normalized);
      const response = await dependencies.fetch(url, { method: "GET", redirect: "manual", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        signal: controller.signal, headers: { Accept: "application/json", "x-api-key": dependencies.env.SUPADATA_API_KEY! } });
      if (response.status >= 300 && response.status < 400) return failure("supadata-unsafe-redirect");
      if (!response.ok) return failure(responseReason(response.status));
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("supadata-invalid-response");
      return parseSupadataMetadata(link, await readJson(response, controller.signal));
    } catch (error) { return failure(error instanceof Error && error.name === "AbortError" ? "supadata-timeout" : "supadata-unavailable"); }
    finally { clearTimeout(timer); requestSignal?.removeEventListener("abort", cancel); controller.abort(); }
  };
}

/**
 * One-call diagnostic companion for an explicitly authorized local maintenance script.
 * The cloned response is bounded and inspected in memory before the production parser
 * sees it; neither the raw response nor any provider text is returned or retained.
 */
export function createSupadataDiagnosticFetcher(dependencies: SupadataDependencies = defaultDependencies): SupadataDiagnosticFetcher {
  return async (link, ownerId, requestSignal) => {
    let diagnostic: SupadataPilotSourceDiagnostic | null = null;
    const fetcher = createSupadataMetadataFetcher({
      ...dependencies,
      fetch: async (input, init) => {
        const response = await dependencies.fetch(input, init);
        if (response.ok && response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
          const controller = new AbortController();
          try {
            const raw = await readJson(response.clone(), controller.signal);
            diagnostic = pilotSupadataSourceDiagnostic(ownerId, link, raw, dependencies.env);
          } catch { /* Production parsing still decides the safe result. */ }
          finally { controller.abort(); }
        }
        return response;
      },
    });
    return { metadata: await fetcher(link, ownerId, requestSignal), diagnostic };
  };
}
