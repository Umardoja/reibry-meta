"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { StatePanel } from "@/components/ui/primitives";
import type { PlanningDraft } from "@/lib/plans/guidance";

const localDateTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Keeps Home's planning conversation review-first. This is deliberately a thin
 * client over the existing owner-bound Plan endpoint; it never writes until the
 * user selects resources and confirms creation.
 */
export function HomePlanningDraft({ draft, modelName = null }: { draft: PlanningDraft; modelName?: string | null }) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [startDate, setStartDate] = useState(localDateTime(draft.startDate));
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedHref, setSavedHref] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const candidates = useMemo(() => draft.candidateMemories, [draft.candidateMemories]);

  function toggle(id: string) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !title.trim() || savedHref) return;
    setBusy(true); setError(""); requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/plans", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, startDate: startDate ? new Date(startDate).toISOString() : null,
          lifeContextId: null, memoryIds: selected, requestId: requestId.current }) });
      const body = await response.json();
      if (!response.ok || !body?.data?.plan?.id) throw new Error(body?.error?.message || "REIBRY couldn't create that Plan.");
      setSavedHref(`/plans/${body.data.plan.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REIBRY couldn't create that Plan.");
    } finally { setBusy(false); }
  }

  if (savedHref) return <section className="home-planning-card" aria-live="polite">
    <p className="section-label">Plan saved</p><h2 className="section-heading">Your Plan is ready for review</h2>
    <p>Nothing has been scheduled or completed. Open the Plan to confirm which selected Memories belong in its Ready Pack.</p>
    <Link className="button btn-primary" href={savedHref}>Open Plan and Ready Pack</Link>
  </section>;

  return <section className="home-planning-card" aria-label="Planning draft">
    <p className="section-label">Planning draft · not saved</p><h2 className="section-heading">Build this from your Memories</h2>
    <p className="field-hint">{draft.daysRemaining === 1 ? "1 day remains." : `${draft.daysRemaining} days remain.`} {modelName ? "Muse helped shape this outline from the saved Memories below." : "This is a reviewable planning outline."} Only checked Memories are added to the Plan.</p>
    <ol className="home-planning-steps">{draft.schedule.map(step => <li key={step.title}><strong>{step.title}</strong><span>{step.description}</span></li>)}</ol>
    <form className="plan-form home-planning-form" onSubmit={create} aria-busy={busy}>
      <label htmlFor="home-plan-title">Plan title</label><input id="home-plan-title" className="input" value={title} maxLength={300} required onChange={event => setTitle(event.target.value)} />
      <label htmlFor="home-plan-date">Date and time</label><input id="home-plan-date" className="input" type="datetime-local" value={startDate} onChange={event => setStartDate(event.target.value)} />
      <label htmlFor="home-plan-description">Suggested schedule</label><textarea id="home-plan-description" className="input" rows={7} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} />
      <fieldset className="ready-pack-choice-section"><legend>Relevant saved Memories</legend>
        {!candidates.length && <p>No saved Memory clearly matches this request. You can keep this general framework, but no source-backed resource will be added.</p>}
        {candidates.map(candidate => <div className="home-planning-choice" key={candidate.memoryId}><label><input type="checkbox" checked={selected.includes(candidate.memoryId)} onChange={() => toggle(candidate.memoryId)} />
          <span><strong>{candidate.displayTitle}</strong><small>{candidate.match.reason}</small>
            {candidate.storedExcerpt && <small>{candidate.storedExcerpt}</small>}</span></label><Link className="home-action-chip" href={`/memories/${candidate.memoryId}`}>View</Link></div>)}
      </fieldset>
      <p className="field-hint">You can edit the Plan later. After it saves, the existing Ready Pack screen asks for a separate confirmation before saving a guide.</p>
      {error && <StatePanel tone="error">{error}</StatePanel>}
      <button className="button btn-primary" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create Plan"}</button>
    </form>
  </section>;
}
