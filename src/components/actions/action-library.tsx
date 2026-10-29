"use client";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { Card } from "@/components/ui/primitives";
import type { ActionCardView } from "@/lib/actions/contracts";
type View = { state: "loading" | "ready" | "error"; items: ActionCardView[]; message: string };
export function ActionLibrary() {
  const [view, setView] = useState<View>({ state: "loading", items: [], message: "" });
  useEffect(() => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000); let active = true;
    void fetch("/api/actions", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok || !Array.isArray(body?.data?.items)) throw new Error(body?.error?.message || "Action Cards could not be loaded.");
      if (active) setView({ state: "ready", items: body.data.items, message: "" });
    }).catch(error => { if (active) setView({ state: "error", items: [], message: error instanceof Error && error.name !== "AbortError" ? error.message : "Action loading took too long." }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);
  return <RequireAuth>
    {view.state === "loading" && <p role="status">Loading confirmed Action Cards…</p>}
    {view.state === "error" && <p className="auth-error" role="alert">{view.message}</p>}
    {view.state === "ready" && view.items.length === 0 && <Card><h2>No saved Action Cards</h2><p>Ask REIBRY for grounded next steps, review one, then explicitly save it.</p></Card>}
    {view.state === "ready" && view.items.length > 0 && <ul className="action-card-list" aria-label="Confirmed Action Cards">{view.items.map(action =>
      <li key={action.id} id={`action-${action.id}`}><Card><div className="action-card-heading"><h2>{action.title}</h2><span className="edition-pill">confirmed</span></div>
        <p>{action.description}</p><p className="field-hint">Saved {new Date(action.confirmedAt).toLocaleDateString()} · Planning artifact only · Not executed</p>
        <h3>Supporting Memories</h3><ul>{action.memoryHrefs.map((href, index) => <li key={href}><a href={href}>Open supporting Memory {index + 1}</a></li>)}</ul>
      </Card></li>)}</ul>}
  </RequireAuth>;
}
