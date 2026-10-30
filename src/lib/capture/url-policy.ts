import { isIP } from "node:net";
import { CaptureContractError } from "./contracts.ts";

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const tiktokHosts = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);
const instagramHosts = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
// Share and campaign parameters that never identify content; stripped from generic links before deduplication.
const trackingParameter = /^(?:utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igsh|igshid|ref_src)$/i;

export function publicAddress(address: string) {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) {
    const [a, b, c] = normalized.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2)) ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  // Fail closed for IPv6 outside global unicast and for documentation/mapped ranges.
  return isIP(normalized) === 6 && /^[23][0-9a-f]{3}:/i.test(normalized) && !/^2001:db8:/i.test(normalized);
}

export function safeHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return isIP(host) ? publicAddress(host) : host.includes(".");
}

export type CapturePlatform = "youtube" | "tiktok" | "instagram" | "web";
export type ParsedCaptureUrl = {
  submitted: string; normalized: string; platform: CapturePlatform; hostname: string;
  /** Owner-scoped deduplication identity: the platform content ID when known, otherwise the cleaned URL. */
  identity: string; postId: string | null; format: "video" | "short" | "photo" | "post" | "reel" | "page" | "profile";
  shortLink: boolean; creatorHandle: string | null;
};
const segment = /^[A-Za-z0-9_-]{1,64}$/;

function youtube(url: URL, submitted: string): ParsedCaptureUrl | null {
  const host = url.hostname.toLowerCase(); const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null; let format: ParsedCaptureUrl["format"] = "video";
  if (host === "youtu.be") id = parts[0] ?? null;
  else if (parts[0] === "watch") id = url.searchParams.get("v");
  else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) { id = parts[1] ?? null; if (parts[0] === "shorts") format = "short"; }
  if (!id || !segment.test(id)) return null;
  return { submitted, normalized: `https://www.youtube.com/watch?v=${id}`, platform: "youtube", hostname: host, identity: `youtube:${id}`,
    postId: id, format, shortLink: host === "youtu.be", creatorHandle: null };
}
function tiktok(url: URL, submitted: string): ParsedCaptureUrl | null {
  const host = url.hostname.toLowerCase(); const parts = url.pathname.split("/").filter(Boolean);
  const post = url.pathname.match(/^\/@([A-Za-z0-9._]{1,64})\/(video|photo)\/(\d{5,25})(?:\/|$)/);
  if (post) return { submitted, normalized: `https://www.tiktok.com/@${post[1]}/${post[2]}/${post[3]}`, platform: "tiktok", hostname: host,
    identity: `tiktok:${post[3]}`, postId: post[3], format: post[2] === "photo" ? "photo" : "video", shortLink: false, creatorHandle: `@${post[1]}` };
  // Share links (vm./vt.tiktok.com/<code>, tiktok.com/t/<code>) only reveal the post after a redirect, resolved during enrichment.
  const code = host === "vm.tiktok.com" || host === "vt.tiktok.com" ? parts[0] : parts[0] === "t" ? parts[1] : null;
  if (code && segment.test(code)) {
    const normalized = host === "vm.tiktok.com" || host === "vt.tiktok.com" ? `https://${host}/${code}/` : `https://www.tiktok.com/t/${code}/`;
    return { submitted, normalized, platform: "tiktok", hostname: host, identity: `tiktok-share:${normalized}`, postId: null, format: "video", shortLink: true, creatorHandle: null };
  }
  return null;
}
function instagram(url: URL, submitted: string): ParsedCaptureUrl | null {
  const post = url.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{1,64})(?:\/|$)/);
  if (!post) return null;
  const kind = post[1] === "reels" ? "reel" : post[1];
  return { submitted, normalized: `https://www.instagram.com/${kind}/${post[2]}/`, platform: "instagram", hostname: url.hostname.toLowerCase(),
    identity: `instagram:${post[2]}`, postId: post[2], format: kind === "reel" || kind === "tv" ? "reel" : "post", shortLink: false, creatorHandle: null };
}

export function parsePublicLink(value: string): ParsedCaptureUrl {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new CaptureContractError("Enter a valid public HTTPS link."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !safeHostname(url.hostname))
    throw new CaptureContractError("Enter a valid public HTTPS link.");
  const submitted = value.trim(); const host = url.hostname.toLowerCase();
  url.hash = "";
  const known = youtubeHosts.has(host) ? youtube(url, submitted) : tiktokHosts.has(host) ? tiktok(url, submitted) : instagramHosts.has(host) ? instagram(url, submitted) : null;
  if (known) return known;
  for (const name of [...url.searchParams.keys()]) if (trackingParameter.test(name)) url.searchParams.delete(name);
  url.searchParams.sort(); url.hostname = host;
  const platform: CapturePlatform = youtubeHosts.has(host) ? "youtube" : tiktokHosts.has(host) ? "tiktok" : instagramHosts.has(host) ? "instagram" : "web";
  const normalized = url.toString();
  return { submitted, normalized, platform, hostname: host, identity: normalized, postId: null, format: platform === "web" ? "page" : "profile", shortLink: false, creatorHandle: null };
}

export function safeMetadataUrl(value: unknown, base?: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && safeHostname(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
