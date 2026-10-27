import { isIP } from "node:net";
import { CaptureContractError } from "./contracts.ts";

const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const tiktokHosts = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

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

function safeHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return isIP(host) ? publicAddress(host) : host.includes(".");
}

export type ParsedCaptureUrl = { submitted: string; normalized: string; platform: "youtube" | "tiktok" | "web"; hostname: string };
export function parsePublicLink(value: string): ParsedCaptureUrl {
  let url: URL;
  try { url = new URL(value); } catch { throw new CaptureContractError("Enter a valid public HTTPS link."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !safeHostname(url.hostname))
    throw new CaptureContractError("Enter a valid public HTTPS link.");
  url.hash = "";
  url.searchParams.sort();
  let platform: ParsedCaptureUrl["platform"] = "web";
  const host = url.hostname.toLowerCase();
  if (youtubeHosts.has(host)) {
    platform = "youtube";
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id) { const params = new URLSearchParams(url.searchParams); params.set("v", id); params.sort(); url = new URL(`https://www.youtube.com/watch?${params}`); }
    }
  } else if (tiktokHosts.has(host)) platform = "tiktok";
  return { submitted: value.trim(), normalized: url.toString(), platform, hostname: host };
}

export function safeMetadataUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && safeHostname(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
