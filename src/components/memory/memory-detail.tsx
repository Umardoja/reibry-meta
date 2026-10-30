"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Memory } from "@/lib/memory/contracts";
import { Card, StatePanel } from "@/components/ui/primitives";
import { IC } from "@/components/design/icons";
import { SourceDetails } from "@/components/capture/source-details";

export function MemoryDetail({ id }: { id: string }) {
  const [memory, setMemory] = useState<Memory | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000); void fetch(`/api/memories/${id}`, { cache: "no-store", signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok || !body?.data) throw new Error(); setMemory(body.data); }).catch(() => setError("This Memory could not be loaded." )).finally(() => clearTimeout(timer)); return () => { clearTimeout(timer); controller.abort(); }; }, [id]);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { const response = await fetch(`/api/memories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), ...(memory?.sourceType === "text" ? { rawText: data.get("rawText") } : {}) }) }); const body = await response.json(); if (!response.ok || !body?.data) throw new Error(); setMemory(body.data); } catch { setError("Changes could not be saved."); } finally { setBusy(false); } }
  if (error && !memory) return <StatePanel title="Memory unavailable"><p>{error}</p><Link href="/memories">Back to Memories</Link></StatePanel>;
  if (!memory) return <p role="status">Loading this Memory…</p>;
  return <><Link className="detail-back" href="/memories">{IC.arrowL} Back to Memories</Link><Card className="memory-detail-card"><p className="eyebrow">{memory.sourceType === "link" ? "Saved link" : "Saved note"}</p><SourceDetails memory={memory} /><form onSubmit={save} className="memory-edit-form"><label htmlFor="memory-title">Title</label><input className="input" id="memory-title" name="title" defaultValue={memory.title} maxLength={200} required />{memory.sourceType === "text" && <><label htmlFor="memory-text">Original note</label><textarea className="input capture-textarea" id="memory-text" name="rawText" defaultValue={memory.rawText || ""} maxLength={50000} required /></>}<button className="button btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form>{memory.sourceUrl && <section><h2>Original source</h2><a className="source-value" href={memory.sourceUrl} target="_blank" rel="noopener noreferrer">{memory.sourceUrl}</a></section>}<section><h2>Processing status</h2><p>{memory.analysisStatus}. No transcript, summary, or page contents are implied unless they were actually stored.</p></section>{error && <p className="auth-error" role="alert">{error}</p>}</Card></>;
}
