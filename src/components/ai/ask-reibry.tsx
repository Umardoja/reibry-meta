"use client";
import { useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { Card } from "@/components/ui/primitives";
import type { AskResponse } from "@/lib/ai/meta/contracts";
import { IC } from "@/components/design/icons";
import { ActionProposalReview } from "@/components/actions/action-proposal-review";

type View = { state: "idle" | "loading" | "ready" | "error"; result: AskResponse | null; message: string; question: string };
export function AskReibry({ variant = "ask" }: { variant?: "ask" | "home" }) {
  const [view, setView] = useState<View>({ state: "idle", result: null, message: "", question: "" });
  async function ask(question: string) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 32_000);
    setView({ state: "loading", result: null, message: "", question });
    try {
      const response = await fetch("/api/ai/ask", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = await response.json();
      if (!response.ok || !body?.data) throw new Error(body?.error?.message || "Ask REIBRY is unavailable.");
      setView({ state: "ready", result: body.data, message: "", question });
    } catch (error) {
      const message = error instanceof Error && error.name !== "AbortError" ? error.message : "Muse Spark took too long to respond.";
      setView({ state: "error", result: null, message, question });
    } finally { clearTimeout(timer); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const question = String(new FormData(event.currentTarget).get("question") || "").trim();
    if (question && view.state !== "loading") void ask(question);
  }
  return <RequireAuth>
    {variant === "home" && <div className="home-welcome"><div className="home-assistant-mark">{IC.brain}</div><div><p className="eyebrow">REIBRY</p><p>I can help you find something you saved, think through a plan, or turn grounded suggestions into Action Cards you approve.</p></div></div>}
    <form className={variant === "home" ? "home-composer" : "ask-form"} onSubmit={submit}>
      <label className="sr-only" htmlFor="ask-question">Question about your saved Memories</label>
      <textarea className="input ask-textarea" id="ask-question" name="question" maxLength={500} required placeholder={variant === "home" ? "Message REIBRY…" : "Describe it however you remember it…"} aria-describedby="ask-hint" />
      <button className="ask-submit" aria-label="Ask REIBRY" type="submit" disabled={view.state === "loading"}>{IC.send}</button>
      <p className="field-hint" id="ask-hint">REIBRY searches stored evidence first. Muse Spark only receives bounded matching Memories.</p>
    </form>
    {variant === "home" && <div className="thought-prompts" aria-label="Things REIBRY can help with"><span className="thought-pill">Find a Memory</span><span className="thought-pill">Plan something</span><span className="thought-pill">What’s coming up?</span></div>}
    {view.state === "loading" && <p className="ask-feedback" role="status">Searching your Memories, then asking Muse Spark only if evidence matches.</p>}
    {view.state === "error" && <div className="ask-feedback"><p className="auth-error" role="alert">{view.message}</p>
      <button className="button btn-ghost" type="button" onClick={() => void ask(view.question)}>Retry</button></div>}
    {view.state === "ready" && view.result && <Card className="ask-answer">
      <div className="ask-answer-heading"><h2>Grounded answer</h2><span className="edition-pill">{view.result.evidence_status.replace("_", " ")}</span></div>
      <p>{view.result.answer}</p>
      {view.result.citations.length > 0 && <section aria-labelledby="ask-citations"><h3 id="ask-citations">Saved evidence</h3><ul>
        {view.result.citations.map(citation => <li key={citation.memory_id}><a href={citation.memory_href}>{citation.title}</a>
          {citation.evidence_limit === "metadata-only-link" && <span> — metadata only</span>}{citation.evidence_limit === "analyzed-video" && <span> — analysed video</span>}{citation.evidence_limit === "video-not-analyzed" && <span> — video not analysed yet</span>}</li>)}</ul></section>}
      {view.result.action_proposals.length > 0 && <ActionProposalReview proposals={view.result.action_proposals} onChanged={proposal => setView(current => current.result ? { ...current, result: { ...current.result, action_proposals: current.result.action_proposals.map(item => item.id === proposal.id ? proposal : item) } } : current)} />}
      {view.result.proposed_next_steps.length > 0 && view.result.action_proposals.length === 0 && <p className="auth-error" role="alert">No model suggestion had enough owned evidence to become a proposal.</p>}
      {!view.result.provider_called && <p className="field-hint">Muse Spark was not called because no matching stored evidence was found.</p>}
    </Card>}
  </RequireAuth>;
}
