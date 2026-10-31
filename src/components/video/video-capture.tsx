"use client";
// Stage 12I-2B: save the user's own short MP4, then analyse it in separate, visible steps. The save never waits for analysis.
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/primitives";
import { VideoAnalysisControls, VideoAnalysisPanel } from "@/components/video/video-analysis";
import type { Memory } from "@/lib/memory/contracts";
import { VIDEO_MAX_BYTES } from "@/lib/video/contracts";

export function VideoCapture() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState<{ memory: Memory; duplicate: boolean } | null>(null);
  const inFlight = useRef(false); const formRef = useRef<HTMLFormElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const form = new FormData(event.currentTarget); const file = form.get("video");
    // Quick local checks for a helpful message; the server re-checks the real container, size and duration.
    if (!(file instanceof File) || !file.size) { setError("Choose an MP4 video."); return; }
    if (file.size > VIDEO_MAX_BYTES) { setError("That video is larger than 20 MB. Choose a shorter or smaller MP4."); return; }
    if (form.get("consent") !== "yes") { setError("Confirm the video is yours, or that you have permission to save and analyse it."); return; }
    inFlight.current = true; setBusy(true); setError(""); setSaved(null);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch("/api/capture/video", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal, body: form });
      const body = await response.json(); if (!response.ok || !body?.data?.memory) throw new Error(body?.error?.message || "The video could not be saved.");
      setSaved(body.data); formRef.current?.reset();
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Uploading took too long. Check Memories before trying again."); }
    finally { clearTimeout(timer); inFlight.current = false; setBusy(false); }
  }
  return <><Card><form ref={formRef} className="capture-form" onSubmit={submit} aria-busy={busy}>
    <h2>Save a short video</h2>
    <p className="field-hint">Your own MP4, up to 20 seconds and 20 MB. It&apos;s stored privately. After saving, you choose whether REIBRY analyses what it shows and says.</p>
    <div className="field"><label htmlFor="video-file">Video (MP4)</label><input className="input" id="video-file" name="video" type="file" accept="video/mp4,.mp4" required /></div>
    <div className="field"><label htmlFor="video-title">Title <span className="optional">(optional)</span></label><input className="input" id="video-title" name="title" maxLength={200} /></div>
    <div className="field"><label htmlFor="video-note">Why are you saving this? <span className="optional">(optional)</span></label><textarea className="input" id="video-note" name="note" rows={2} maxLength={2000} /></div>
    <label className="field"><span><input type="checkbox" name="consent" value="yes" required /> This video is mine, or I have permission to save it and have REIBRY analyse it with Meta&apos;s AI.</span></label>
    <button className="button btn-primary" type="submit" disabled={busy}>{busy ? "Uploading…" : "Save video"}</button>
  </form></Card>
  {error && <p className="auth-error" role="alert">{error}</p>}
  {saved && saved.memory.video && <Card><div className="capture-result" role="status"><p className="eyebrow">{saved.duplicate ? "Already saved" : "Saved"}</p>
    <h2>{saved.memory.title}</h2>
    <VideoAnalysisControls memory={saved.memory} onChange={memory => setSaved({ ...saved, memory })} />
    <VideoAnalysisPanel video={saved.memory.video} />
    <Link href={`/memories/${saved.memory.id}`} className="button btn-ghost">View saved Memory</Link></div></Card>}
  </>;
}
