"use client";
// Stage 12J-3: opening a Memory should feel like opening the saved thing itself — its cover, its real details, your note, and what to
// do next. Supplementary details (what REIBRY knows, editing, video analysis) stay one tap away. Only stored facts are shown.
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { IC } from "@/components/design/icons";
import { KindGlyph, MemoryCover } from "@/components/memory/memory-visual";
import { VideoAnalysisControls, VideoAnalysisPanel } from "@/components/video/video-analysis";
import type { Memory } from "@/lib/memory/contracts";
import { presentMemory, tiktokPlayerUrl } from "@/lib/memory/presentation";

type RelatedPlan = { id: string; title: string };
export function MemoryDetail({ id, videoTools = false }: { id: string; videoTools?: boolean }) {
  const [memory, setMemory] = useState<Memory | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState("");
  const [plans, setPlans] = useState<RelatedPlan[] | null>(null); const [details, setDetails] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    // A cleanup abort (unmount, or development mode running effects twice) is not a failure; a 12 s timeout still is.
    let cancelled = false; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    void fetch(`/api/memories/${id}`, { cache: "no-store", signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok || !body?.data) throw new Error(); if (!cancelled) setMemory(body.data); })
      .catch(() => { if (!cancelled) setError("This Memory is unavailable. It may have been deleted."); }).finally(() => clearTimeout(timer));
    void fetch("/api/plans?limit=100", { cache: "no-store", signal: controller.signal }).then(async response => { const body = await response.json();
      if (!cancelled && response.ok && Array.isArray(body?.data)) setPlans(body.data.filter((plan: { memories?: Array<{ id: string }> }) => plan.memories?.some(item => item.id === id)).map((plan: RelatedPlan) => ({ id: plan.id, title: plan.title }))); })
      .catch(() => { /* Related plans are optional. */ });
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [id]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(""); const data = new FormData(event.currentTarget);
    const rawText = data.get("rawText"); const note = typeof rawText === "string" ? rawText : "";
    try { const response = await fetch(`/api/memories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: data.get("title"), ...(memory?.sourceType === "text" ? { rawText: note } : { rawText: note.trim() ? note : null }) }) });
      const body = await response.json(); if (!response.ok || !body?.data) throw new Error(); setMemory(body.data); setSaved("Changes saved."); }
    catch { setError("Your changes couldn't be saved. Try again."); } finally { setBusy(false); }
  }
  async function refreshDetails() {
    if (details.busy) return; setDetails({ busy: true, message: "" });
    try { const response = await fetch(`/api/capture/${id}/details`, { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const body = await response.json(); if (!response.ok || !body?.data?.memory) throw new Error("More details are unavailable right now.");
      setMemory(body.data.memory); setDetails({ busy: false, message: "" }); }
    catch { setDetails({ busy: false, message: "More details are unavailable right now. Your link is still saved." }); }
  }
  if (error && !memory) return <RequireAuth><div className="empty-state"><h2>Memory unavailable</h2><p>{error}</p><Link href="/memories" className="button btn-ghost">Back to Memories</Link></div></RequireAuth>;
  if (!memory) return <RequireAuth><div className="memory-page" aria-busy="true"><div className="skeleton-card" aria-hidden="true"><span /><span /><span /></div><p role="status" className="sr-only">Opening this Memory…</p></div></RequireAuth>;
  const view = presentMemory(memory); const player = tiktokPlayerUrl(memory);
  return <RequireAuth>
    <Link className="detail-back" href="/memories">{IC.arrowL} Memories</Link>
    <article className="memory-page">
      <div className="memory-media">
        <MemoryCover view={view} size="hero" excerpt={view.kind === "note" ? memory.rawText : null} />
      </div>
      <div className="memory-story">
        <p className="memory-kicker"><span className="kind"><KindGlyph kind={view.kind} />{view.kindLabel}</span>{view.creator && <><span className="dot" />{view.creator}</>}<span className="dot" /><span>{view.savedLabel}</span></p>
        <h1 className="memory-title">{view.title}</h1>
        {view.summary && view.kind !== "note" && <p className="memory-summary"><small>{view.summary.from}</small>{view.summary.text}</p>}
        {view.kind === "note" && memory.rawText && memory.rawText.trim() !== memory.title.trim() && <p className="memory-summary" style={{ whiteSpace: "pre-line" }}>{memory.rawText}</p>}
        {view.note && <p className="memory-note"><span className="memory-note-label">Your note</span>{view.note}</p>}
        {view.hashtags.length > 0 && <p className="memory-tags">{view.hashtags.map(tag => <span key={tag}>#{tag}</span>)}</p>}
        {view.details.state === "limited" && <div className="memory-limit"><span>{view.details.message}</span></div>}
        {view.details.state === "pending" && <div className="memory-limit"><span>More details will appear here when available.</span></div>}
        <div className="memory-actions">
          {view.originalUrl && <a className="button btn-primary" href={view.originalUrl} target="_blank" rel="noopener noreferrer">{IC.external}{view.openLabel}</a>}
          {player && <button type="button" className="button btn-ghost" aria-expanded={preview} aria-controls="tiktok-preview" onClick={() => setPreview(open => !open)}>{preview ? "Hide preview" : "Preview video"}</button>}
          <Link className="button btn-ghost" href={`/plans?memory=${view.id}`}>{IC.plan}Use in a plan</Link>
          {(view.details.state === "limited" || view.details.state === "pending") && <button type="button" className="button btn-ghost" disabled={details.busy} onClick={() => void refreshDetails()}>{details.busy ? "Getting details…" : "Try again"}</button>}
        </div>
        {details.message && <p className="field-hint" role="status">{details.message}</p>}
        {/* Stage 12K-1: TikTok's official player, loaded only when asked for. What it shows stays inside TikTok's frame. */}
        {player && preview && <div className="tiktok-preview" id="tiktok-preview">
          <iframe src={player} title="TikTok's player for this video" allow="fullscreen; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation" />
          <p className="field-hint">This preview stays on TikTok.</p></div>}
        {plans && plans.length > 0 && <section className="related-plans" aria-labelledby="related-plans"><h2 id="related-plans" className="eyebrow">In your plans</h2>
          {plans.map(plan => <Link key={plan.id} href={`/plans/${plan.id}`}><span>{plan.title}</span>{IC.arrowR}</Link>)}</section>}

        {memory.sourceType === "video" && memory.video && (view.videoAnalysed || videoTools) && <details className="disclosure" open={!view.videoAnalysed && videoTools ? true : undefined}>
          <summary>What REIBRY found in your video<small>{view.videoAnalysed ? "Analysed" : "Not analysed"}</small></summary>
          <div className="disclosure-body">{videoTools && <VideoAnalysisControls memory={memory} onChange={setMemory} />}<VideoAnalysisPanel video={memory.video} /></div></details>}

        <details className="disclosure"><summary>Saved details<small>{view.knows.length ? `${view.knows.reduce((sum, group) => sum + group.items.length, 0)} details` : "Original link"}</small></summary>
          <div className="disclosure-body">
            {view.knows.map(group => <div className="knows-group" key={group.heading}><h3>{group.heading}</h3><ul>{group.items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>)}
            {view.originalUrl && <div className="knows-group"><h3>Saved link</h3><ul><li style={{ overflowWrap: "anywhere" }}>{view.originalUrl}</li></ul></div>}
          </div></details>

        <details className="disclosure"><summary>Edit title or note</summary>
          <form onSubmit={save} className="memory-edit-form disclosure-body">
            <label htmlFor="memory-title">Title</label><input className="input" id="memory-title" name="title" defaultValue={memory.title} maxLength={200} required />
            <label htmlFor="memory-text">{memory.sourceType === "text" ? "Note" : "Your note"}</label>
            <textarea className="input capture-textarea" id="memory-text" name="rawText" defaultValue={memory.rawText || ""} maxLength={50000} required={memory.sourceType === "text"} />
            <button className="button btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            {saved && <p className="field-hint" role="status">{saved}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
          </form></details>
      </div>
    </article>
  </RequireAuth>;
}
