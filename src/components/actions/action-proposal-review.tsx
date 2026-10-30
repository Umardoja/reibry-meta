"use client";
import { useState } from "react";
import type { ActionCardView, ActionProposalView } from "@/lib/actions/contracts";

export function ActionProposalReview({ proposals, onChanged }: { proposals: ActionProposalView[]; onChanged: (proposal: ActionProposalView) => void }) {
  const [reviewing, setReviewing] = useState<string | null>(null); const [saving, setSaving] = useState<string | null>(null); const [message, setMessage] = useState("");
  async function transition(proposal: ActionProposalView, operation: "confirm" | "reject") {
    setSaving(proposal.id); setMessage("");
    try { const response = await fetch(`/api/actions/proposals/${proposal.id}/${operation}`, { method: "POST", credentials: "same-origin", cache: "no-store" });
      const body = await response.json(); if (!response.ok || !body?.data) throw new Error(body?.error?.message || "The Action could not be saved.");
      const updated = { ...proposal, status: operation === "confirm" ? "confirmed" as const : "rejected" as const,
        confirmedAt: operation === "confirm" ? (body.data as ActionCardView).confirmedAt : null };
      onChanged(updated); setReviewing(null); setMessage(operation === "confirm" ? "Action Card saved. It is a planning artifact, not an executed action." : "Proposal rejected. No Action Card was created.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The Action could not be saved."); }
    finally { setSaving(null); }
  }
  return <section aria-label="Suggested next steps"><h3>Suggested next steps — review required</h3><ul className="action-proposal-list">
    {proposals.map(proposal => <li key={proposal.id} className="action-proposal"><strong>{proposal.title}</strong><p>{proposal.description}</p>
      <p className="field-hint">Status: {proposal.status}. Saving creates an internal Action Card only.</p>
      {proposal.status === "proposed" && reviewing !== proposal.id && <button className="button btn-ghost" type="button" onClick={() => setReviewing(proposal.id)}>Review action</button>}
      {proposal.status === "proposed" && reviewing === proposal.id && <div className="action-review" role="group" aria-label={`Review ${proposal.title}`}><p>Confirm that you want to save this planning artifact. Nothing will be executed externally.</p>
        <button className="button btn-primary" type="button" disabled={saving === proposal.id} onClick={() => void transition(proposal, "confirm")}>{saving === proposal.id ? "Saving…" : "Save action"}</button>
        <button className="button btn-ghost" type="button" disabled={saving === proposal.id} onClick={() => void transition(proposal, "reject")}>Reject</button>
        <button className="button btn-ghost" type="button" disabled={saving === proposal.id} onClick={() => setReviewing(null)}>Cancel review</button></div>}
      {proposal.status === "confirmed" && <a href="/actions">View saved Action Cards</a>}
    </li>)}</ul>{message && <p className="auth-notice" role="status">{message}</p>}</section>;
}
