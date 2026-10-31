"use client";
import { useState } from "react";
import type { Memory } from "@/lib/memory/contracts";

const platforms: Record<string, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", web: "Web" };
// Plain-language explanations for metadata the platform did not provide. The link itself is always saved.
const reasons: Record<string, string> = {
  "provider-timeout": "The platform took too long to share details.",
  "save-budget-exceeded": "Details took too long, so REIBRY saved the link first.",
  "not-found-or-private": "The post may be private, deleted, or unavailable in your region.",
  "provider-blocked": "The site blocked automated previews.",
  "instagram-requires-meta-app-token": "Instagram doesn't share post details without an approved Meta app, so only the link is saved.",
  "share-link-unresolved": "The share link couldn't be opened to find the original post.",
  "provider-returned-no-title": "Saved. REIBRY couldn't retrieve this video's description or cover.",
  "unsafe-destination": "This link points somewhere REIBRY won't fetch.",
  "not-a-web-page": "This link isn't a web page, so there was nothing to preview.",
  "no-page-metadata": "The page doesn't publish preview details.",
  "provider-error": "The platform didn't return usable details.",
};
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function limitationText(status: unknown, reason: unknown) {
  if (status === "complete") return null;
  return (typeof reason === "string" && reasons[reason]) || (status === "partial" ? "Only some details were available." : "Details weren't available, but the link is saved.");
}

export function SourceDetails({ memory }: { memory: Memory }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (memory.sourceType !== "link" || !memory.sourceUrl) return null;
  const meta = memory.metadata; const platform = platforms[String(meta.platform)] ?? "Web";
  const thumbnail = text(meta.thumbnailUrl); const creator = text(meta.author); const caption = text(meta.caption); const site = text(meta.siteName);
  const limitation = limitationText(meta.enrichment, meta.enrichmentReason);
  return <section className="source-details" aria-label="Saved source">
    {/* Provider covers come from arbitrary platform hosts, so a plain no-referrer <img> is used instead of next/image remote patterns. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {thumbnail && !imageFailed && <img className="source-thumb" src={thumbnail} alt={`Cover image supplied by ${platform}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
    <div className="source-meta">
      <p className="source-line"><strong>{platform}</strong>{creator && <> · {creator}</>}{site && platform === "Web" && <> · {site}</>}</p>
      {caption ? <p className="source-caption">{caption}</p> : <p className="field-hint">REIBRY couldn&apos;t retrieve a description.</p>}
      {memory.rawText && <p className="source-note"><span className="field-hint">Your note:</span> {memory.rawText}</p>}
      <p className="field-hint">Saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(memory.createdAt))}. Details come from the {platform === "Web" ? "page" : platform} link only; nothing was watched or transcribed.</p>
      {limitation && <p className="field-hint">{limitation}</p>}
      <a className="button btn-ghost source-open" href={memory.sourceUrl} target="_blank" rel="noopener noreferrer">Open original</a>
    </div>
  </section>;
}
