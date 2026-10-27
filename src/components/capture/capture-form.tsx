"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/auth/require-auth";
import type { Memory } from "@/lib/memory/contracts";

type CaptureReply = { memory: Memory; duplicate: boolean; enrichment: { status: "complete" | "unavailable" | "unsupported"; provider: string | null } };
export function CaptureForm() {
  const [kind, setKind] = useState<"text" | "link">("text"); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureReply | null>(null); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setResult(null);
    const form = new FormData(event.currentTarget); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/capture", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: kind, content: form.get("content"), title: form.get("title") }) });
      const body = await response.json(); if (!response.ok || !body?.data?.memory) throw new Error(body?.error?.message || "This source could not be saved.");
      setResult(body.data);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Saving took too long. The result is unknown; check Memories before retrying."); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  return <RequireAuth><Card><form className="capture-form" onSubmit={submit} aria-describedby="capture-policy">
    <fieldset className="capture-choice"><legend>What are you saving?</legend>
      <label><input type="radio" name="kind" value="text" checked={kind === "text"} onChange={() => setKind("text")} /> Note</label>
      <label><input type="radio" name="kind" value="link" checked={kind === "link"} onChange={() => setKind("link")} /> Public HTTPS link</label>
    </fieldset>
    <div className="field"><label htmlFor="capture-content">{kind === "text" ? "Note" : "Link"}</label>
      {kind === "text" ? <textarea className="input capture-textarea" id="capture-content" name="content" maxLength={50000} required placeholder="Paste or write the original note" />
        : <input className="input" id="capture-content" name="content" type="url" inputMode="url" maxLength={2048} required placeholder="https://example.com/source" />}
      <p className="field-hint" id="capture-policy">The original source is preserved. No AI analysis runs in this milestone.</p></div>
    <div className="field"><label htmlFor="capture-title">Title <span className="optional">(optional)</span></label>
      <input className="input" id="capture-title" name="title" maxLength={200} placeholder="Use source title when available" /></div>
    <button className="button btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Memory"}</button>
  </form></Card>
  {error && <p className="auth-error" role="alert">{error}</p>}
  {result && <Card><div className="capture-result" role="status"><p className="eyebrow">{result.duplicate ? "Already saved" : "Saved"}</p>
    <h2>{result.memory.title}</h2><p className="source-value">{result.memory.sourceUrl || "Original note preserved"}</p>
    <p>Status: {result.memory.analysisStatus} (AI analysis has not run).</p>
    {result.enrichment.status === "unavailable" && <p>Preview metadata was unavailable, but the original source was saved.</p>}
    {result.enrichment.status === "unsupported" && result.memory.sourceType === "link" && <p>This link type is stored without a server-fetched preview.</p>}
    <Link href="/memories" className="button btn-ghost">View saved Memory</Link></div></Card>}
  </RequireAuth>;
}
