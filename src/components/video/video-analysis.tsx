"use client";
// Stage 12I-2B: what REIBRY actually found in a user's own video, with the source of every part, plus the step-by-step analysis controls.
import { useRef, useState } from "react";
import type { Memory } from "@/lib/memory/contracts";
import { nextVideoStep, type MemoryVideo, type VideoStep } from "@/lib/video/contracts";

const failures: Record<string, string> = {
  "provider-timeout": "Meta took too long to respond.", "provider-unavailable": "Meta's service was unavailable.", "provider-rejected": "Meta rejected the request.",
  "invalid-provider-output": "Meta's answer couldn't be verified, so nothing was saved from it.", "media-unavailable": "The saved video couldn't be read.",
  "audio-extraction-failed": "The audio couldn't be extracted from the video.", "not-configured": "Video analysis isn't set up on this server.",
};
const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)} s`;

export function videoStateLabel(video: MemoryVideo, phase: VideoStep | null) {
  if (phase === "visual") return "Analyzing visual details…";
  if (phase === "speech") return video.hasAudio ? "Transcribing speech…" : "Finishing analysis…";
  if (video.status === "ready") return "Analysis ready";
  if (video.status === "processing") return "Analysis in progress";
  if (video.status === "failed") return nextVideoStep(video) ? "Analysis failed — Retry" : "Analysis couldn't be completed";
  return video.visual ? "Visual details ready · speech not transcribed yet" : "Ready to analyze";
}

export function VideoAnalysisControls({ memory, onChange }: { memory: Memory; onChange: (memory: Memory) => void }) {
  const [phase, setPhase] = useState<VideoStep | null>(null); const [error, setError] = useState(""); const running = useRef(false);
  const video = memory.video; if (!video) return null;
  async function analyse() {
    if (running.current || !video) return; running.current = true; setError("");
    let current = memory; let step = nextVideoStep(video);
    try {
      while (step) {
        setPhase(step);
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 90_000);
        try {
          const response = await fetch(`/api/capture/${current.id}/video-analysis`, { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
            headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) });
          const body = await response.json(); if (!response.ok || !body?.data?.memory) throw new Error(body?.error?.message || "The analysis step could not be completed.");
          current = body.data.memory as Memory; onChange(current);
        } finally { clearTimeout(timer); }
        if (!current.video || current.video.status === "failed") break;
        step = nextVideoStep(current.video);
      }
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The analysis took too long. Your video is still saved; try again."); }
    finally { setPhase(null); running.current = false; }
  }
  const step = nextVideoStep(video);
  return <div className="field" aria-live="polite"><p className="eyebrow">{videoStateLabel(video, phase)}</p>
    {video.status === "failed" && video.failureCode && <p className="field-hint">{failures[video.failureCode] ?? "The analysis failed."} Your video is still saved.</p>}
    {!phase && step && video.status !== "processing" && <button type="button" className="button btn-primary" onClick={() => void analyse()}>
      {video.status === "failed" ? "Retry analysis" : video.visual ? "Transcribe speech" : "Analyze video"}</button>}
    {phase && <p className="field-hint">Keep this page open while REIBRY analyses the video. If you leave, the video stays saved and you can start again from the Memory.</p>}
    {!step && video.status === "failed" && <p className="field-hint">The retry limit was reached. The video stays saved.</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}</div>;
}

export function VideoAnalysisPanel({ video }: { video: MemoryVideo }) {
  const visual = video.visual;
  if (!visual) return <p className="field-hint">Saved {seconds(video.durationMs)} MP4{video.hasAudio ? " with audio" : " without audio"}. Nothing has been analysed yet, so REIBRY doesn&apos;t know what&apos;s in it.</p>;
  return <section className="video-analysis" aria-label="Video analysis">
    {video.summary && <p>{video.summary}</p>}
    <h3>What the video shows</h3>
    <p className="field-hint">From REIBRY&apos;s analysis of the video.</p>
    <ol>{visual.scenes.map((scene, index) => <li key={index}><strong>{scene.startSeconds}–{scene.endSeconds} s:</strong> {scene.background} background
      {scene.objects.length ? `; ${scene.objects.join(", ")}` : ""}{scene.onScreenText.length ? `; on-screen text “${scene.onScreenText.join(" / ")}”` : ""}; {scene.motion}</li>)}</ol>
    <ul>{visual.observations.map((item, index) => <li key={index}>{item}</li>)}</ul>
    <h3>What was said</h3>
    {!video.hasAudio ? <p className="field-hint">This video has no audio track.</p>
      : !video.transcript ? <p className="field-hint">Speech hasn&apos;t been transcribed yet.</p>
      : video.transcript.text ? <><p className="field-hint">Transcribed by Muse Voice Transcribe. Machine transcripts can mishear names.</p>
        <ul>{video.transcript.turns.map((turn, index) => <li key={index}><strong>{seconds(turn.startMs)}–{seconds(turn.endMs)}:</strong> {turn.text}</li>)}</ul></>
      : <p className="field-hint">No speech was transcribed.</p>}
    {visual.interpretations.length > 0 && <><h3>Interpretations</h3><p className="field-hint">Inferences from what was seen, not observed facts.</p>
      <ul>{visual.interpretations.map((item, index) => <li key={index}>{item.claim} <span className="optional">(based on {item.basedOn})</span></li>)}</ul></>}
    {(video.concepts.length > 0 || visual.occasions.length > 0) && <><h3>Topics and occasions</h3>
      <p className="source-value">{[...video.concepts, ...visual.occasions.map(item => `${item.suggestion}${item.basis === "inferred" ? " (inferred)" : ""}`)].join(" · ")}</p></>}
    {visual.gaps.length > 0 && <><h3>Not visible or uncertain</h3><ul>{visual.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    <p className="field-hint">What it shows comes from REIBRY&apos;s analysis of the video ({visual.fps} frame per second). {video.transcript ? "What&apos;s said comes from an automatic transcript. " : ""}
      {video.analyzedAt ? `Analysed ${new Date(video.analyzedAt).toLocaleString()}.` : ""}</p>
  </section>;
}
