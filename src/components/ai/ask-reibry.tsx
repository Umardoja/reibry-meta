"use client";
import { useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { Card } from "@/components/ui/primitives";
import type { AskResponse } from "@/lib/ai/meta/contracts";
import type { ActionCardView, ActionProposalView } from "@/lib/actions/contracts";

type View = { state: "idle" | "loading" | "ready" | "error"; result: AskResponse | null; message: string; question: string };
export function AskReibry() {
  const [view, setView] = useState<View>({ state: "idle", result: null, message: "", question: "" });
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
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
  async function transition(proposal: ActionProposalView, operation: "confirm" | "reject") {
    setSaving(proposal.id); setActionMessage("");
    try {
      const response = await fetch(`/api/actions/proposals/${proposal.id}/${operation}`, { method: "POST", credentials: "same-origin", cache: "no-store" });
      const body = await response.json(); if (!response.ok || !body?.data) throw new Error(body?.error?.message || "The Action could not be saved.");
      setView(current => current.result ? { ...current, result: { ...current.result,
        action_proposals: current.result.action_proposals.map(item => item.id === proposal.id ? { ...item,
          status: operation === "confirm" ? "confirmed" : "rejected", confirmedAt: operation === "confirm" ? (body.data as ActionCardView).confirmedAt : null } : item) } } : current);
      setReviewing(null); setActionMessage(operation === "confirm" ? "Action Card saved. It is a planning artifact, not an executed action." : "Proposal rejected. No Action Card was created.");
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "The Action could not be saved."); }
    finally { setSaving(null); }
  }
  return <RequireAuth>
    <form className="ask-form" onSubmit={submit}>
      <div className="field"><label htmlFor="ask-question">Question about your saved Memories</label>
        <textarea className="input ask-textarea" id="ask-question" name="question" maxLength={500} required
          placeholder="What do my saved notes say about the project launch?" aria-describedby="ask-hint" />
        <p className="field-hint" id="ask-hint">REIBRY retrieves stored evidence first. Muse Spark cannot access Memories that were not returned by that search.</p></div>
      <button className="button btn-primary" type="submit" disabled={view.state === "loading"}>{view.state === "loading" ? "Reasoning over evidence…" : "Ask REIBRY"}</button>
    </form>
    {view.state === "loading" && <p className="ask-feedback" role="status">Searching your Memories, then asking Muse Spark only if evidence matches.</p>}
    {view.state === "error" && <div className="ask-feedback"><p className="auth-error" role="alert">{view.message}</p>
      <button className="button btn-ghost" type="button" onClick={() => void ask(view.question)}>Retry</button></div>}
    {view.state === "ready" && view.result && <Card className="ask-answer">
      <div className="ask-answer-heading"><h2>Grounded answer</h2><span className="edition-pill">{view.result.evidence_status}</span></div>
      <p>{view.result.answer}</p>
      {view.result.citations.length > 0 && <section aria-labelledby="ask-citations"><h3 id="ask-citations">Saved evidence</h3><ul>
        {view.result.citations.map(citation => <li key={citation.memory_id}><a href={citation.memory_href}>{citation.title}</a>
          {citation.evidence_limit === "metadata-only-link" && <span> — metadata only</span>}</li>)}</ul></section>}
      {view.result.action_proposals.length > 0 && <section aria-labelledby="ask-suggestions"><h3 id="ask-suggestions">Suggested next steps — review required</h3><ul className="action-proposal-list">
        {view.result.action_proposals.map(proposal => <li key={proposal.id} className="action-proposal"><strong>{proposal.title}</strong><p>{proposal.description}</p>
          <p className="field-hint">Status: {proposal.status}. Saving creates an internal Action Card only.</p>
          {proposal.status === "proposed" && reviewing !== proposal.id && <button className="button btn-ghost" type="button" onClick={() => setReviewing(proposal.id)}>Review action</button>}
          {proposal.status === "proposed" && reviewing === proposal.id && <div className="action-review" role="group" aria-label={`Review ${proposal.title}`}>
            <p>Confirm that you want to save this planning artifact. Nothing will be executed externally.</p>
            <button className="button btn-primary" type="button" disabled={saving === proposal.id} onClick={() => void transition(proposal, "confirm")}>{saving === proposal.id ? "Saving…" : "Save action"}</button>
            <button className="button btn-ghost" type="button" disabled={saving === proposal.id} onClick={() => void transition(proposal, "reject")}>Reject</button>
            <button className="button btn-ghost" type="button" disabled={saving === proposal.id} onClick={() => setReviewing(null)}>Cancel review</button>
          </div>}
          {proposal.status === "confirmed" && <a href="/actions">View saved Action Cards</a>}
        </li>)}</ul></section>}
      {view.result.proposed_next_steps.length > 0 && view.result.action_proposals.length === 0 && <p className="auth-error" role="alert">No model suggestion had enough owned evidence to become a proposal.</p>}
      {actionMessage && <p className="auth-notice" role="status">{actionMessage}</p>}
      {!view.result.provider_called && <p className="field-hint">Muse Spark was not called because no matching stored evidence was found.</p>}
    </Card>}
  </RequireAuth>;
}
