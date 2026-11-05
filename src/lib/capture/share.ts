// Stage 12J-1: share-sheet / Apple Shortcut handoff. Pure (server and browser): it only PREFILLS the Capture form; nothing is saved
// until the signed-in user taps Save. Only an HTTPS link, an optional title and the text around the link are accepted; any other
// parameter (including any user identity) is ignored. The save request validates the link again (parsePublicLink).
export const SHARED_URL_MAX = 2_048;
export const SHARED_TEXT_MAX = 5_000;
export const SHARED_TITLE_MAX = 200;
export type SharedPayload = { url: string; title: string; note: string };

/** get(name) returns the raw value of url, text or title from the query string or the URL fragment. */
export function parseSharedPayload(get: (name: "url" | "text" | "title") => string | null | undefined): SharedPayload | null {
  const one = (name: "url" | "text" | "title") => { const value = get(name); return typeof value === "string" ? value.trim() : ""; };
  const text = one("text").slice(0, SHARED_TEXT_MAX); const direct = one("url");
  // Share sheets often send the link inside text ("Check out this video https://vm.tiktok.com/..."). Only https links are taken.
  const candidate = /^https:\/\/\S+$/i.test(direct) ? direct : text.match(/https:\/\/[^\s<>"']+/i)?.[0] ?? "";
  if (!candidate || candidate.length > SHARED_URL_MAX) return null;
  let url: URL; try { url = new URL(candidate); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
  return { url: candidate, title: one("title").replace(/\s+/g, " ").slice(0, SHARED_TITLE_MAX), note: text.replace(candidate, "").replace(/\s+/g, " ").trim().slice(0, SHARED_TEXT_MAX) };
}

/** Reads a fragment handoff (#url=...&title=...). The fragment never reaches the server, server logs or Referer headers. */
export function parseSharedFragment(hash: string): SharedPayload | null {
  if (!hash || hash.length > SHARED_URL_MAX + SHARED_TEXT_MAX + SHARED_TITLE_MAX + 64) return null;
  let params: URLSearchParams; try { params = new URLSearchParams(hash.replace(/^#/, "")); } catch { return null; }
  return parseSharedPayload(name => params.get(name));
}

// Stage 12K: words a share sheet sends WITH the link (for example a creator's caption) are kept as "Shared with the link", never as the
// user's own note and never as an official platform caption. Generic app wording is removed so only meaningful words remain.
export const SHARED_WITH_LINK_MAX = 1_000;
const shareBoilerplate = [
  /\b(?:check out|watch|look at)\s+(?:this|my|@?[\p{L}\p{N}._]+(?:'s|’s))\s+(?:video|post|reel|short|tiktok|photo)s?(?:\s+on\s+#?(?:tiktok|instagram|youtube))?\s*[!.:]*/giu,
  /\b(?:watch|see|discover)\s+more\s+(?:[\p{L}]+\s+){0,2}(?:videos?|posts?)\s+on\s+#?(?:tiktok|instagram|youtube)\s*[!.]*/giu,
  /\b(?:download|get)\s+(?:the\s+)?#?(?:tiktok|instagram)(?:\s+app)?\s*[!.:]*/giu,
  /\b(?:shared|sent)\s+(?:via|from|with)\s+(?:the\s+|my\s+)?#?(?:tiktok|instagram|youtube|iphone|ipad)(?:\s+app)?\s*[!.]*/giu,
  /(?:^|\s)#tiktok(?![\p{L}\p{N}_])/giu,
];
/** Returns the meaningful words shared alongside a link, or "" when only links, handles or app boilerplate arrived. */
export function cleanSharedText(value: string) {
  let text = value.slice(0, SHARED_TEXT_MAX).replace(/https?:\/\/\S+/gi, " ");
  for (const pattern of shareBoilerplate) text = text.replace(pattern, " ");
  text = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").replace(/^[\s>|:•·–—-]+|[\s>|:•·–—-]+$/g, "").trim();
  if (!/\p{L}{2,}/u.test(text.replace(/@[\p{L}\p{N}._]+/gu, " "))) return "";
  return text.length > SHARED_WITH_LINK_MAX ? `${text.slice(0, SHARED_WITH_LINK_MAX - 1).trimEnd()}…` : text;
}

/** What a share delivered to Capture (query and fragment), so the page can say so when no usable link arrived (e.g. a Shortcut whose
 * Text action produced "#url=" with nothing after it). Additive: it uses the parsers above unchanged and is never sent anywhere. */
export type ShareArrival = { arrived: boolean; fromShortcut: boolean; payload: SharedPayload | null; received: string };
export function readShareArrival(search: string, hash: string): ShareArrival {
  const query = new URLSearchParams(search);
  let fragment: URLSearchParams; try { fragment = new URLSearchParams(hash.replace(/^#/, "")); } catch { fragment = new URLSearchParams(); }
  const keys = ["url", "text", "title"] as const;
  const arrived = keys.some(key => query.has(key) || fragment.has(key)) || query.get("src") === "shortcut" || fragment.get("src") === "shortcut";
  const fromShortcut = query.get("src") === "shortcut" || fragment.get("src") === "shortcut";
  const payload = parseSharedFragment(hash) ?? parseSharedPayload(name => query.get(name));
  const received = keys.map(key => fragment.get(key) ?? query.get(key)).filter((value): value is string => !!value && !!value.trim()).join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
  return { arrived, fromShortcut, payload, received };
}
