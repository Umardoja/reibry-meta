"use client";
// Stage 12J-3 "Personal Memory Atlas": the visual pieces every Memory surface shares.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { MemoryKind, MemoryView } from "@/lib/memory/presentation";

// Simple generic glyphs (not platform logos) so a tile is clearly a placeholder, never a fake frame of the saved video.
const glyphs: Record<MemoryKind, ReactNode> = {
  tiktok: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>,
  youtube: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" /></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1" fill="currentColor" /></svg>,
  web: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" /></svg>,
  note: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>,
  video: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3z" /></svg>,
};
export function KindGlyph({ kind }: { kind: MemoryKind }) { return <span className={`kind-glyph kind-${kind}`} aria-hidden="true">{glyphs[kind]}</span>; }

/** The platform's real cover when there is one; otherwise a designed tile. A note's tile shows the note's own first words. */
export function MemoryCover({ view, excerpt, size = "card" }: { view: MemoryView; excerpt?: string | null; size?: "card" | "hero" | "thumb" }) {
  const [failed, setFailed] = useState(false);
  if (view.thumbnail && !failed) return <div className={`memory-cover cover-${size}`}>
    {/* Platform covers come from arbitrary hosts: a plain no-referrer <img> in a fixed-ratio frame (no layout shift). */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={view.thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    <span className="cover-badge"><KindGlyph kind={view.kind} />{view.platformName}</span>
  </div>;
  return <div className={`memory-cover cover-${size} tile tile-${view.kind}`}>
    {view.kind === "note" && excerpt ? <p className="tile-excerpt">{excerpt}</p> : <span className="tile-mark"><KindGlyph kind={view.kind} /></span>}
    <span className="cover-badge"><KindGlyph kind={view.kind} />{view.platformName}</span>
  </div>;
}

export function MemoryCard({ view, excerpt }: { view: MemoryView; excerpt?: string | null }) {
  return <Link href={view.href} className="memory-card">
    <MemoryCover view={view} excerpt={excerpt} />
    <span className="memory-card-body">
      <span className="memory-card-kind"><KindGlyph kind={view.kind} />{view.kindLabel}</span>
      <span className="memory-card-title">{view.title}</span>
      {view.creator ? <span className="memory-card-meta">{view.creator}</span> : view.summary && view.kind !== "note" ? <span className="memory-card-meta">{view.summary.text}</span> : null}
      <span className="memory-card-saved">{view.savedLabel}</span>
    </span>
  </Link>;
}
