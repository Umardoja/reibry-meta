import "server-only";
import { lookup } from "node:dns/promises";
import { publicAddress, safeMetadataUrl, type ParsedCaptureUrl } from "./url-policy.ts";

const endpointHosts = new Set(["www.youtube.com", "www.tiktok.com"]);
export type MetadataResult = { status: "complete" | "unavailable" | "unsupported"; provider: "youtube-oembed" | "tiktok-oembed" | null; title?: string; author?: string; thumbnailUrl?: string };
export type AddressResolver = (hostname: string) => Promise<Array<{ address: string }>>;
export type MetadataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

async function readBoundedJson(response: Response, signal: AbortSignal, maxBytes = 65_536) {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !response.body) throw new Error("unsupported-content");
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("oversized-response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > maxBytes) { cancel(); throw new Error("oversized-response"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

export async function fetchVettedJson(endpoint: URL, options: { fetcher?: MetadataFetch; resolve?: AddressResolver; timeoutMs?: number; maxBytes?: number } = {}) {
  if (endpoint.protocol !== "https:" || !endpointHosts.has(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.port) throw new Error("untrusted-endpoint");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 3_000);
  const resolve = options.resolve ?? (host => lookup(host, { all: true }));
  try {
    const records = await Promise.race([resolve(endpoint.hostname), new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("metadata-timeout")), { once: true });
    })]);
    if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error("unsafe-address");
    const response = await (options.fetcher ?? fetch)(endpoint, { signal: controller.signal, redirect: "manual", cache: "no-store",
      credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
    if (response.status >= 300 && response.status < 400) throw new Error("unsafe-redirect");
    if (!response.ok) throw new Error("metadata-http-error");
    return await readBoundedJson(response, controller.signal, options.maxBytes);
  } finally { clearTimeout(timer); controller.abort(); }
}

function clean(value: unknown, max: number) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined; }
export async function enrichLink(link: ParsedCaptureUrl, options: Parameters<typeof fetchVettedJson>[1] = {}): Promise<MetadataResult> {
  if (link.platform === "web") return { status: "unsupported", provider: null };
  const provider = link.platform === "youtube" ? "youtube-oembed" : "tiktok-oembed";
  const endpoint = new URL(link.platform === "youtube" ? "https://www.youtube.com/oembed" : "https://www.tiktok.com/oembed");
  endpoint.searchParams.set("url", link.normalized); if (link.platform === "youtube") endpoint.searchParams.set("format", "json");
  try {
    const data = await fetchVettedJson(endpoint, options);
    return { status: "complete", provider, title: clean(data.title, 200), author: clean(data.author_name, 200),
      thumbnailUrl: safeMetadataUrl(data.thumbnail_url) ?? undefined };
  } catch { return { status: "unavailable", provider }; }
}
