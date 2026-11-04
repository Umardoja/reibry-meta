"use client";

import { useState, type FormEvent } from "react";
import { HomePlanningDraft } from "@/components/plans/home-planning-draft";
import { StatePanel } from "@/components/ui/primitives";
import type { HomeResponse } from "@/lib/home/contracts";

/** A focused Plans entry point over the existing authenticated Home orchestration. It never creates a Plan itself. */
export function PlanWithMuse() {
  const [request, setRequest] = useState("");
  const [response, setResponse] = useState<HomeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = request.trim();
    if (!message || busy) return;
    setBusy(true); setError(""); setResponse(null);
    try {
      const result = await fetch("/api/home", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mode: "plan", history: [], references: [], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }) });
      const body = await result.json();
      if (!result.ok || !body?.data) throw new Error("REIBRY couldn't prepare a plan right now.");
      if (body.data.intent !== "CLARIFICATION" && !body.data.planningDraft)
        throw new Error("REIBRY couldn't prepare a usable plan draft. Try adding the goal and date.");
      setResponse(body.data);
    } catch { setError("REIBRY couldn't prepare a plan right now. Try again."); }
    finally { setBusy(false); }
  }

  return <section className="plan-with-muse" aria-label="Plan with Muse">
    {!response && <form className="plan-form" onSubmit={ask} aria-busy={busy}>
      <p className="field-hint">Describe what you are preparing for. Muse searches only your saved Memories and asks for a date or subject only when it needs one.</p>
      <label htmlFor="muse-plan-request">What are you planning?</label>
      <textarea id="muse-plan-request" className="input" rows={4} maxLength={500} value={request} onChange={event => setRequest(event.target.value)}
        placeholder="I have a biology exam next week. Help me prepare using my saved videos." required />
      <button className="button btn-primary" disabled={busy || !request.trim()}>{busy ? "Preparing…" : "Find my saved ideas"}</button>
    </form>}
    {error && <StatePanel tone="error">{error}</StatePanel>}
    {response && <>
      <p className="field-hint">{response.message}</p>
      {response.planningDraft ? <HomePlanningDraft draft={response.planningDraft} modelName={response.groundedAnswer?.model ?? null} /> : <StatePanel>{response.message}</StatePanel>}
      <button type="button" className="button btn-ghost" onClick={() => { setResponse(null); setError(""); }}>Start over</button>
    </>}
  </section>;
}
