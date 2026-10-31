"use client";
// Stage 12J-3 Capture: one obvious action. Paste or share a link (or write a note), tap Save, get back to life.
// Request 1 saves immediately; request 2 fetches whatever details the platform shares. Nothing is ever saved without the user's tap.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/auth/require-auth";
import { IC } from "@/components/design/icons";
import { KindGlyph, MemoryCover } from "@/components/memory/memory-visual";
import type { Memory } from "@/lib/memory/contracts";
import { presentMemory, type MemoryKind } from "@/lib/memory/presentation";
import { cleanSharedText, parseSharedPayload, readShareArrival, type ShareArrival, type SharedPayload } from "@/lib/capture/share";

type Enrichment = { status: "complete" | "partial" | "unavailable" | "unsupported" | "timed-out" | "pending"; provider: string | null; reason?: string };
type CaptureReply = { memory: Memory; duplicate: boolean; enrichment: Enrichment };
type DetailsReply = { memory: Memory; enrichment: Enrichment; merged?: boolean };
export type { SharedPayload };
const PENDING_KEY = "reibry-pending-share";

/** A share handed over before sign-in (iPhone Shortcut / share link) is kept per tab for up to 1 hour, then cleared. */
export function readPendingShare(): SharedPayload | null {
  if (typeof window === "undefined") return null;
  try { const raw = sessionStorage.getItem(PENDING_KEY); if (!raw) return null;
    const value = JSON.parse(raw) as SharedPayload & { at: number }; return Date.now() - value.at < 3_600_000 ? { url: value.url, title: value.title, note: value.note } : null; } catch { return null; }
}
function clearPendingShare() { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ } }
export function storePendingShare(payload: SharedPayload) { try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...payload, at: Date.now() })); } catch { /* storage unavailable */ } }
const noArrival: ShareArrival = { arrived: false, fromShortcut: false, payload: null, received: "" };
// The #fragment is read with parseSharedFragment (via readShareArrival) on arrival; the server never sees it.
function readArrival(): ShareArrival { return typeof window === "undefined" ? noArrival : readShareArrival(window.location.search, window.location.hash); }
const platformOf = (url: string): MemoryKind => /tiktok\.com/i.test(url) ? "tiktok" : /youtube\.com|youtu\.be/i.test(url) ? "youtube" : /instagram\.com/i.test(url) ? "instagram" : "web";
const platformName: Record<MemoryKind, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", web: "Web", note: "Note", video: "Video" };
// Stage 12K: a share's link goes in the box; the words that came with it are kept apart as "Shared with the link", not as the user's note.
const prefill = (payload: SharedPayload | null) => payload?.url ?? "";
const sharedWords = (payload: SharedPayload | null) => payload?.note ? cleanSharedText(payload.note) : "";

export function CaptureForm({ shared }: { shared?: SharedPayload | null }) {
  // Prefill order: server-read query share, a share kept through sign-in, then a #fragment share.
  const [arrival, setArrival] = useState<ShareArrival>(() => readArrival());
  const [initial, setInitial] = useState<SharedPayload | null>(() => shared ?? readPendingShare() ?? readArrival().payload);
  const [content, setContent] = useState(() => prefill(initial));
  const [title, setTitle] = useState(() => initial?.title ?? "");
  const [sharedText, setSharedText] = useState(() => sharedWords(initial));
  // Stage 12K-1: a share handoff shows a compact screen (link and Save first); typing or pasting here keeps the full one.
  const [handoff, setHandoff] = useState(() => !!initial?.url);
  const [noteAdded, setNoteAdded] = useState(false);
  const [forceNote, setForceNote] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<CaptureReply | null>(null);
  const [details, setDetails] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const [canPaste] = useState(() => typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
  const inFlight = useRef(false); const detailsInFlight = useRef(false); const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Once the shared link is in the form, remove it from the address bar and history (keeping Next's own history state).
    if (window.location.search || window.location.hash) window.history.replaceState(window.history.state, "", "/capture");
    // Safari can reuse an open REIBRY tab for a new share: then only the #fragment changes and the page does not reload.
    function onHash() {
      const next = readShareArrival("", window.location.hash); if (!next.arrived) return;
      setArrival(next); setResult(null); setError(""); setForceNote(false); setHandoff(!!next.payload);
      if (next.payload) { setInitial(next.payload); setContent(prefill(next.payload)); setTitle(next.payload.title); setSharedText(sharedWords(next.payload)); }
      window.history.replaceState(window.history.state, "", "/capture");
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A link (optionally with words around it, as share sheets send) is saved as a link; anything else as a note.
  const detected = useMemo(() => {
    const trimmed = content.trim(); if (!trimmed) return null;
    const found = parseSharedPayload(name => name === "text" ? trimmed : null);
    if (!forceNote && found && trimmed.length - found.url.length <= 600) return { kind: "link" as const, url: found.url, note: found.note, platform: platformOf(found.url) };
    return { kind: "note" as const, linkPresent: !!found };
  }, [content, forceNote]);
  // Shared words belong only to the link they arrived with.
  const sharedWithLink = detected?.kind === "link" && sharedText && detected.url === initial?.url ? sharedText : "";

  async function paste() {
    try { const text = (await navigator.clipboard.readText()).trim(); if (!text) { setError("Your clipboard is empty. Copy a link first."); return; }
      setContent(text); setForceNote(false); setError(""); fieldRef.current?.focus(); }
    catch { setError("REIBRY couldn't read the clipboard. Long-press the box and choose Paste instead."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detected) return; if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); setResult(null); setNoteAdded(false); setDetails({ busy: false, message: "" });
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    const body = detected.kind === "link"
      ? { sourceType: "link", content: detected.url, ...(title.trim() ? { title: title.trim() } : {}), ...([detected.note, note].filter(Boolean).length ? { note: [detected.note, note].filter(Boolean).join("\n") } : {}),
        ...(sharedWithLink ? { sharedText: sharedWithLink } : {}) }
      : { sourceType: "text", content: content.trim(), ...(title.trim() ? { title: title.trim() } : {}) };
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/capture", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const reply = await response.json(); if (!response.ok || !reply?.data?.memory) throw new Error(reply?.error?.message || "This couldn't be saved. Check the link and try again.");
      const saved = reply.data as CaptureReply;
      setResult(saved); setContent(""); setTitle(""); setSharedText(""); setInitial(null); setArrival(noArrival); clearPendingShare();
      // Request 2: details are fetched only after the save is acknowledged. If the tab closes, the Memory stays saved and Retry resumes.
      if (saved.memory.sourceType === "link" && saved.memory.metadata.enrichment !== "complete") void getDetails(saved);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Saving took too long. Check Memories before trying again — it may already be saved."); }
    finally { clearTimeout(timer); inFlight.current = false; setBusy(false); }
  }
  async function getDetails(current: CaptureReply) {
    if (detailsInFlight.current) return; detailsInFlight.current = true; setDetails({ busy: true, message: "" });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/api/capture/${current.memory.id}/details`, { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const body = await response.json() as { data: DetailsReply | null; error: { message: string } | null }; if (!response.ok || !body.data) throw new Error(body.error?.message || "Details are still unavailable.");
      const reply = body.data;
      setResult({ ...current, memory: reply.memory, enrichment: reply.enrichment, duplicate: current.duplicate || !!reply.merged });
      setDetails({ busy: false, message: reply.merged ? "You'd already saved this TikTok, so REIBRY kept your earlier Memory and added anything new to it." : "" });
    } catch (cause) { setDetails({ busy: false, message: cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Getting details took too long. Your link is still saved." }); }
    finally { clearTimeout(timer); detailsInFlight.current = false; }
  }
  function another() { setResult(null); setHandoff(false); setDetails({ busy: false, message: "" }); setTimeout(() => fieldRef.current?.focus(), 0); }

  const view = result ? presentMemory(result.memory) : null;
  const detailState = !view || view.details.state === "none" ? null : details.busy ? "Getting details…" : view.details.state === "ready" ? "Details ready" : view.details.state === "pending" ? "Details not fetched yet" : "Limited details";
  // Only when the platform shared nothing useful: one optional question, answered in the user's own words (typed or dictated).
  const askWhy = !!result && result.memory.sourceType === "link" && !details.busy && !!view && (view.details.state === "limited" || (view.details.state === "pending" && !!details.message))
    && (noteAdded || !result.memory.rawText);
  const shareProblem = arrival.arrived && !arrival.payload && !content.trim() && !result;
  return <RequireAuth nextPath="/capture">
    {shareProblem && <section className="notice" role="status" aria-live="polite">
      <h2>{arrival.fromShortcut ? "Your Shortcut opened REIBRY, but no link came with it" : "Something was shared, but no link came with it"}</h2>
      <p>Nothing has been saved. In the app you were using, choose Share → Copy link, then tap Paste.</p>
      <div className="inline-actions">{canPaste && <button type="button" className="btn-soft" onClick={() => void paste()}>{IC.paste}Paste link</button>}</div>
      {arrival.received && <details><summary>What arrived</summary><code>{arrival.received}</code></details>}
    </section>}
    {!result && <form className="capture-box" onSubmit={submit} aria-busy={busy} data-handoff={handoff ? "" : undefined}>
      <label htmlFor="capture-content" className="sr-only">Paste a link or write a note</label>
      <textarea ref={fieldRef} id="capture-content" name="content" rows={handoff ? 2 : undefined} value={content} onChange={event => { setContent(event.target.value); setError(""); }} maxLength={50_000}
        placeholder="Paste a link or write a note…" spellCheck aria-describedby="capture-detected" required />
      <div className="capture-detected" id="capture-detected" aria-live="polite">
        {!detected && !handoff && <span>Links from TikTok, YouTube, Instagram and the web, or any note.</span>}
        {detected?.kind === "link" && <><KindGlyph kind={detected.platform} /><span><strong>{platformName[detected.platform]} link</strong>{detected.note ? " · the words around it become your note" : ""}</span>
          {detected.note && <button type="button" className="chip" onClick={() => setForceNote(true)}>Save as a note instead</button>}</>}
        {detected?.kind === "note" && <><KindGlyph kind="note" /><span>Saved as a note, exactly as written.</span>
          {forceNote && <button type="button" className="chip" onClick={() => setForceNote(false)}>Save the link instead</button>}</>}
      </div>
      {sharedWithLink && <p className="field-hint shared-with-link"><strong>Shared with the link:</strong> {sharedWithLink.length > 160 ? `${sharedWithLink.slice(0, 159)}…` : sharedWithLink}{" "}
        <button type="button" className="chip" onClick={() => setSharedText("")}>Don&apos;t keep</button></p>}
      <details className="capture-extras" open={initial?.title ? true : undefined}>
        <summary>Add a title or note</summary>
        <div className="field"><label htmlFor="capture-title">Title <span className="optional">(optional)</span></label>
          <input className="input" id="capture-title" name="title" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Birthday cake idea" /></div>
        {detected?.kind !== "note" && <div className="field"><label htmlFor="capture-note">Why are you saving this? <span className="optional">(optional)</span></label>
          <textarea className="input" id="capture-note" name="note" rows={2} maxLength={5000} placeholder="e.g. Pink cake for Mum's birthday" /></div>}
      </details>
      <div className="capture-submit">
        {canPaste && <button type="button" className="button btn-ghost" onClick={() => void paste()} aria-label="Paste from clipboard">{IC.paste}<span>Paste</span></button>}
        <button className="button btn-primary" type="submit" disabled={busy || !detected}>{busy ? "Saving…" : "Save to REIBRY"}</button>
      </div>
    </form>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {result && view && <section className="saved-card capture-result" role="status" aria-live="polite" data-handoff={handoff ? "" : undefined}>
      <div className="saved-headline"><span className="saved-check">{IC.check}</span>
        <div><h2 className="eyebrow-like">{result.duplicate ? "Already saved" : "Saved"}</h2><p>{result.duplicate ? "It was already in your Memories." : "It's in your Memories. Get back to what you were doing."}</p></div></div>
      <Link href={view.href} className="saved-preview"><MemoryCover view={view} size="thumb" excerpt={view.kind === "note" ? result.memory.rawText : null} />
        <span className="memory-card-body"><span className="memory-card-title">{view.title}</span>
          <span className="memory-card-meta">{[view.kindLabel, view.creator].filter(Boolean).join(" · ")}</span></span></Link>
      {detailState && <p className="details-line eyebrow-status">{details.busy && <span className="spinner" aria-hidden="true" />}{detailState}{!details.busy && view.details.message ? ` — ${view.details.message}` : ""}</p>}
      {details.message && <p className="field-hint" role="status">{details.message}</p>}
      {askWhy && <WhatCaughtYourEye key={result.memory.id} memoryId={result.memory.id} onSaved={memory => { setNoteAdded(true); setResult(current => current && { ...current, memory }); }} />}
      <div className="inline-actions">
        {view.details.state !== "none" && view.details.state !== "ready" && <button type="button" className="button btn-ghost" disabled={details.busy} onClick={() => void getDetails(result)}>{details.busy ? "Getting details…" : "Retry getting details"}</button>}
        <Link href={view.href} className="button btn-ghost">View Memory</Link>
        <button type="button" className="button btn-primary" onClick={another}>Save another</button>
      </div>
    </section>}
  </RequireAuth>;
}


/** Stage 12K-1: the optional after-save note. It is written to the Memory's own note through the owner-only Memory update (PATCH), so
 *  it is searchable and reaches Home as the user's note. iPhone keyboard dictation works in the box; REIBRY records no audio itself. */
function WhatCaughtYourEye({ memoryId, onSaved }: { memoryId: string; onSaved: (memory: Memory) => void }) {
  const [state, setState] = useState<"open" | "saving" | "added" | "skipped">("open"); const [error, setError] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const note = String(new FormData(event.currentTarget).get("why") ?? "").trim(); if (!note || state === "saving") return;
    setState("saving"); setError("");
    try { const response = await fetch(`/api/memories/${memoryId}`, { method: "PATCH", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawText: note }) });
      const body = await response.json(); if (!response.ok || !body?.data) throw new Error(); onSaved(body.data as Memory); setState("added"); }
    catch { setState("open"); setError("That couldn't be added. Your link is still saved; try again or skip."); }
  }
  if (state === "skipped") return null;
  if (state === "added") return <p className="field-hint why-added" role="status">{IC.check} Added to this Memory as your note.</p>;
  return <form className="why-form" onSubmit={add} aria-busy={state === "saving"}>
    <label htmlFor="why-note">What caught your eye? <span className="optional">(optional)</span></label>
    <textarea className="input" id="why-note" name="why" rows={2} maxLength={500} autoCapitalize="sentences" enterKeyHint="done" placeholder="e.g. Pasta bake to try on Sunday" aria-describedby="why-hint" />
    <p className="field-hint" id="why-hint">In your own words, so you can find it later. You can use the keyboard&apos;s microphone to speak.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="why-actions"><button type="submit" className="button btn-primary" disabled={state === "saving"}>{state === "saving" ? "Adding…" : "Add"}</button>
      <button type="button" className="button btn-ghost" onClick={() => setState("skipped")}>Skip</button></div>
  </form>;
}
