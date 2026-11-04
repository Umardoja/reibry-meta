"use client";
import { useState } from "react";
import type { Memory } from "@/lib/memory/contracts";
import { isOperationalSourceText } from "@/lib/memory/presentation";

const platforms: Record<string, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", web: "Web" };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const hasExternalSourceDetail = (meta: Memory["metadata"], field: string) => !!meta.provenance && typeof meta.provenance === "object" && !Array.isArray(meta.provenance) && meta.provenance[field] === "supadata-unverified";

export function limitationText(status: unknown) {
  if (status === "complete") return null;
  return status === "partial" ? "Only some details are available." : "More details are unavailable right now. The original link is still saved.";
}

export function SourceDetails({ memory }: { memory: Memory }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (memory.sourceType !== "link" || !memory.sourceUrl) return null;
  const meta = memory.metadata; const platform = platforms[String(meta.platform)] ?? "Web";
  const thumbnail = text(meta.thumbnailUrl); const creator = text(meta.author); const rawCaption = text(meta.caption); const caption = isOperationalSourceText(rawCaption) ? null : rawCaption; const site = text(meta.siteName);
  const limitation = limitationText(meta.enrichment); const unverified = hasExternalSourceDetail(meta, "caption") || hasExternalSourceDetail(meta, "author") || meta.metadataProvider === "supadata-unverified";
  return <section className="source-details" aria-label="Saved source">
    {/* Provider covers come from arbitrary platform hosts, so a plain no-referrer <img> is used instead of next/image remote patterns. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {thumbnail && !imageFailed && <img className="source-thumb" src={thumbnail} alt={`Cover image supplied by ${platform}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />}
    <div className="source-meta">
      <p className="source-line"><strong>{platform}</strong>{creator && <> · {creator}</>}{site && platform === "Web" && <> · {site}</>}</p>
      {caption ? <p className="source-caption">{caption}</p> : <p className="field-hint">No description is available from this source.</p>}
      {memory.rawText && <p className="source-note"><span className="field-hint">Your note:</span> {memory.rawText}</p>}
      <p className="field-hint">Saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(memory.createdAt))}. {unverified ? "Additional details are shown here." : `Details come from the ${platform === "Web" ? "page" : platform} link.`}</p>
      {limitation && <p className="field-hint">{limitation}</p>}
      <a className="button btn-ghost source-open" href={memory.sourceUrl} target="_blank" rel="noopener noreferrer">Open original</a>
    </div>
  </section>;
}
