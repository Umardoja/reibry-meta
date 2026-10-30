"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/auth/require-auth";
import { SourceDetails, limitationText } from "@/components/capture/source-details";
import type { Memory } from "@/lib/memory/contracts";

type Enrichment = { status: "complete" | "partial" | "unavailable" | "unsupported" | "timed-out" | "pending"; provider: string | null; reason?: string };
type CaptureReply = { memory: Memory; duplicate: boolean; enrichment: Enrichment };
type DetailsReply = { memory: Memory; enrichment: Enrichment };
export type SharedPayload = { url: string; title: string; note: string };
const PENDING_KEY = "reibry-pending-share";

/** A share handed over before sign-in (iPhone Shortcut / share link) is kept per tab for up to 1 hour, then cleared. */
export function readPendingShare(): SharedPayload | null {
  if (typeof window === "undefined") return null;
  try { const raw = sessionStorage.getItem(PENDING_KEY); if (!raw) return null;
    const value = JSON.parse(raw) as SharedPayload & { at: number }; return Date.now() - value.at < 3_600_000 ? { url: value.url, title: value.title, note: value.note } : null; } catch { return null; }
}
function clearPendingShare() { try { sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ } }
export function storePendingShare(payload: SharedPayload) { try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...payload, at: Date.now() })); } catch { /* storage unavailable */ } }

export function CaptureForm({ shared }: { shared?: SharedPayload | null }) {
  // A signed-out share stored by ShareHandoff prefills the form after sign-in; reading is non-destructive (cleared only once saved).
  const [initial, setInitial] = useState<SharedPayload | null>(() => shared ?? readPendingShare());
  const [kind, setKind] = useState<"text" | "link">(() => (shared ?? readPendingShare())?.url ? "link" : "text"); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureReply | null>(null); const [error, setError] = useState("");
  const [details, setDetails] = useState<{ busy: boolean; message: string }>({ busy: false, message: "" });
  const inFlight = useRef(false); const detailsInFlight = useRef(false); const formRef = useRef<HTMLFormElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); setResult(null); setDetails({ busy: false, message: "" });
    const form = new FormData(event.currentTarget); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/capture", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: kind, content: form.get("content"), title: form.get("title"), ...(kind === "link" ? { note: form.get("note") } : {}) }) });
      const body = await response.json(); if (!response.ok || !body?.data?.memory) throw new Error(body?.error?.message || "This source could not be saved.");
      const saved = body.data as CaptureReply;
      setResult(saved); formRef.current?.reset(); setInitial(null); clearPendingShare();
      // Request 2: details are fetched only after the save is acknowledged. If the tab closes, the Memory stays saved and Retry resumes.
      if (saved.memory.sourceType === "link" && saved.memory.metadata.enrichment !== "complete") void getDetails(saved);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Saving took too long. The result is unknown; check Memories before retrying."); }
    finally { clearTimeout(timer); inFlight.current = false; setBusy(false); }
  }
  async function getDetails(current: CaptureReply) {
    if (detailsInFlight.current) return; detailsInFlight.current = true; setDetails({ busy: true, message: "" });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/api/capture/${current.memory.id}/details`, { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const body = await response.json() as { data: DetailsReply | null; error: { message: string } | null }; if (!response.ok || !body.data) throw new Error(body.error?.message || "Details are still unavailable.");
      const reply = body.data;
      setResult({ ...current, memory: reply.memory, enrichment: reply.enrichment });
      setDetails({ busy: false, message: reply.enrichment.status === "complete" ? "" : limitationText(reply.enrichment.status, reply.enrichment.reason) ?? "" });
    } catch (cause) { setDetails({ busy: false, message: cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Getting details took too long. The link is still saved." }); }
    finally { clearTimeout(timer); detailsInFlight.current = false; }
  }
  const status = result?.enrichment.status;
  const headline = !result ? "" : result.memory.sourceType === "text" ? (result.duplicate ? "Already saved" : "Saved")
    : `${result.duplicate ? "Already saved" : "Saved"} · ${details.busy ? "Getting details…" : status === "complete" ? "Details ready" : status === "partial" ? "Some details ready" : status === "pending" ? "Details not fetched yet" : "Limited details"}`;
  return <RequireAuth nextPath="/capture"><Card><form ref={formRef} className="capture-form" onSubmit={submit} aria-describedby="capture-policy" aria-busy={busy}>
    <fieldset className="capture-choice"><legend>What are you saving?</legend>
      <label><input type="radio" name="kind" value="link" checked={kind === "link"} onChange={() => setKind("link")} /> Link</label>
      <label><input type="radio" name="kind" value="text" checked={kind === "text"} onChange={() => setKind("text")} /> Note</label>
    </fieldset>
    <div className="field"><label htmlFor="capture-content">{kind === "text" ? "Note" : "Link"}</label>
      {kind === "text" ? <textarea className="input capture-textarea" id="capture-content" name="content" maxLength={50000} required placeholder="Paste or write the original note" />
        : <input key={initial?.url ?? "link"} className="input" id="capture-content" name="content" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
          maxLength={2048} required defaultValue={initial?.url ?? ""} placeholder="Paste a TikTok, YouTube, Instagram or web link" />}
      <p className="field-hint" id="capture-policy">{kind === "link" ? "The link is saved right away. REIBRY then adds any details the platform shares, like the title, creator and cover." : "Your note is saved exactly as written."}</p></div>
    {kind === "link" && <div className="field"><label htmlFor="capture-note">Why are you saving this? <span className="optional">(optional)</span></label>
      <textarea key={initial?.note ?? "note"} className="input" id="capture-note" name="note" rows={2} maxLength={5000} defaultValue={initial?.note ?? ""} placeholder="e.g. Pink cake idea for Mum's birthday" /></div>}
    <div className="field"><label htmlFor="capture-title">Title <span className="optional">(optional)</span></label>
      <input key={initial?.title ?? "title"} className="input" id="capture-title" name="title" maxLength={200} defaultValue={initial?.title ?? ""} placeholder="Use the source title when available" /></div>
    <button className="button btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Memory"}</button>
  </form></Card>
  {error && <p className="auth-error" role="alert">{error}</p>}
  {result && <Card><div className="capture-result" role="status"><p className="eyebrow">{headline}</p>
    <h2>{result.memory.title}</h2>
    {result.memory.sourceType === "link" ? <SourceDetails memory={result.memory} /> : <p className="source-value">Original note preserved</p>}
    {result.memory.sourceType === "link" && status !== "complete" && <button type="button" className="button btn-ghost" disabled={details.busy} onClick={() => void getDetails(result)}>{details.busy ? "Getting details…" : "Retry getting details"}</button>}
    {details.message && <p className="field-hint" role="status">{details.message}</p>}
    <Link href={`/memories/${result.memory.id}`} className="button btn-ghost">View saved Memory</Link></div></Card>}
  </RequireAuth>;
}
