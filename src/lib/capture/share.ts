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
