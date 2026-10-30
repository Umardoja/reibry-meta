"use client";
// Presentation follows REIBRY Original app/page.tsx at 76d3494; orchestration uses hardened Meta Edition services.
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ActionProposalReview } from "@/components/actions/action-proposal-review";
import { RequireAuth } from "@/components/auth/require-auth";
import { PageContainer, StatePanel } from "@/components/ui/primitives";
import type { ActionProposalView } from "@/lib/actions/contracts";
import type { HomeResponse } from "@/lib/home/contracts";

type Turn = { id: number; role: "user" | "assistant"; text?: string; response?: HomeResponse };

function EvidenceList({ response }: { response: HomeResponse }) {
  const items = response.groundedAnswer?.citations.map(item => ({ id: item.memory_id, href: item.memory_href, title: item.title,
    excerpt: item.evidence_limit === "metadata-only-link" ? "Metadata-only saved link. No webpage or transcript content was used." : null,
    reason: item.evidence_limit === "metadata-only-link" ? "metadata only" : "stored evidence" })) ?? response.memories.map(item => ({ id: item.memoryId, href: item.memoryHref,
      title: item.displayTitle, excerpt: item.storedExcerpt, reason: `${item.match.reason}${item.sourceType === "link" ? " Link evidence is metadata only." : ""}` }));
  if (!items.length) return null;
  return <div className="home-option-list">{items.map(item => <article className="home-option" key={item.id}><span className="home-option-copy"><strong>{item.title}</strong>
    <small>{item.excerpt || item.reason}</small></span><span className="home-option-actions"><Link className="home-action-chip" href={item.href}>View Memory</Link></span></article>)}</div>;
}

function LifeList({ response }: { response: HomeResponse }) {
  if (!response.lifeContexts.length) return null;
  return <div className="home-option-list">{response.lifeContexts.map(context => <Link className="home-option home-life-option" key={context.id} href={context.href}>
    <span className="home-option-copy"><strong>{context.title}</strong><small>{context.startDate ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(context.startDate)) : "No date set"} · {context.type}</small></span><span>Open</span></Link>)}</div>;
}

export function HomeConversation() {
  const [turns, setTurns] = useState<Turn[]>([]); const [text, setText] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const nextId = useRef(0); const controller = useRef<AbortController | null>(null); const endRef = useRef<HTMLDivElement>(null); const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "end" }); }, [turns, loading]);
  function append(...items: Turn[]) { setTurns(current => [...current, ...items].slice(-24)); }
  function updateProposal(turnId: number, proposal: ActionProposalView) { setTurns(current => current.map(turn => turn.id === turnId && turn.response ? { ...turn, response: { ...turn.response,
    actionProposals: turn.response.actionProposals.map(item => item.id === proposal.id ? proposal : item),
    groundedAnswer: turn.response.groundedAnswer ? { ...turn.response.groundedAnswer, action_proposals: turn.response.groundedAnswer.action_proposals.map(item => item.id === proposal.id ? proposal : item) } : null } } : turn)); }
  async function request(message: string, mode: "message" | "confirm-life" = "message") {
    controller.current?.abort(); const active = new AbortController(); controller.current = active; const timer = setTimeout(() => active.abort(), 32_000);
    setLoading(true); setError("");
    try { const response = await fetch("/api/home", { method: "POST", credentials: "same-origin", cache: "no-store", signal: active.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, mode, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }) });
      const body = await response.json(); if (!response.ok || !body?.data) throw new Error(body?.error?.message || "REIBRY could not complete that request.");
      append({ id: ++nextId.current, role: "assistant", response: body.data });
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "REIBRY took too long to respond."); }
    finally { clearTimeout(timer); if (controller.current === active) controller.current = null; setLoading(false); }
  }
  function submit(event?: FormEvent) { event?.preventDefault(); const value = text.trim(); if (!value || loading) return; append({ id: ++nextId.current, role: "user", text: value }); setText(""); void request(value); }
  function choose(value: string) { setText(value); textareaRef.current?.focus(); }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }
  function newChat() { controller.current?.abort(); setTurns([]); setText(""); setError(""); setLoading(false); }
  return <RequireAuth nextPath="/"><PageContainer className={`home-page${turns.length ? " home-page-conversation" : ""}`}>
    <div className="home-intro"><div className="home-intro-row"><p className="section-label">From saved to done</p>{turns.length > 0 && <button type="button" className="home-new-chat" onClick={newChat}>New chat</button>}</div>
      <h1 className="page-h1">What are you trying to do?</h1><p className="page-sub">Ask about something you&apos;ve saved, or tell REIBRY what&apos;s coming up.</p></div>
    <section className="home-thread" aria-label="Conversation with REIBRY">
      {!turns.length && <div className="home-welcome"><span className="home-assistant-label">REIBRY</span><p>Tell me what you&apos;re planning, or ask about something you&apos;ve saved.</p><div className="home-suggestions">
        <button type="button" onClick={() => choose("Find my saved travel notes")}>Find a Memory</button><button type="button" onClick={() => choose("Add my meeting tomorrow at 10am")}>Plan something</button><button type="button" onClick={() => choose("What's coming up?")}>What&apos;s coming up?</button></div></div>}
      {turns.map(turn => <div key={turn.id} className={turn.role === "user" ? "home-turn home-turn-user" : "home-turn home-turn-assistant"}>{turn.role === "user" ? <p className="home-user-bubble">{turn.text}</p> : turn.response && <div className="home-assistant-turn"><span className="home-assistant-label">REIBRY</span><p>{turn.response.message}</p>
        {turn.response.groundedAnswer && <p className="home-grounding-status">Evidence: {turn.response.groundedAnswer.evidence_status}{!turn.response.groundedAnswer.provider_called ? " · Muse Spark was not called because no matching evidence was found." : ""}</p>}
        <EvidenceList response={turn.response}/><LifeList response={turn.response}/>
        {turn.response.lifeDraft && <div className="home-draft-card"><p><strong>{turn.response.lifeDraft.title}</strong></p><p>{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(turn.response.lifeDraft.startDate!))} · {turn.response.lifeDraft.type}</p><p className="field-hint">This is a draft. It has not been saved and no reminder is scheduled.</p><div className="home-message-actions">
          <button className="home-action-chip" type="button" disabled={loading} onClick={() => void request(turn.response!.lifeDraft!.sourceText, "confirm-life")}>Save to Life</button><Link className="home-action-chip" href="/life">Review Life</Link></div></div>}
        {turn.response.savedLife && <Link className="home-action-chip" href={turn.response.savedLife.href}>View saved Life context</Link>}
        {turn.response.actionProposals.length > 0 && <ActionProposalReview proposals={turn.response.actionProposals} onChanged={proposal => updateProposal(turn.id, proposal)} />}
      </div>}</div>)}
      {loading && <div className="home-turn home-turn-assistant" aria-live="polite"><div className="home-assistant-turn"><span className="home-assistant-label">REIBRY</span><p className="home-typing">Looking through your saved information…</p></div></div>}
      {error && <StatePanel tone="error">{error} <button type="button" className="home-retry" onClick={() => { const prior = [...turns].reverse().find(turn => turn.role === "user")?.text; if (prior) void request(prior); }}>Try again</button></StatePanel>}
      <div className="home-thread-end" ref={endRef}/>
    </section>
    <form className="home-composer" onSubmit={submit}><label htmlFor="home-input" className="sr-only">Message REIBRY</label><textarea ref={textareaRef} id="home-input" rows={1} maxLength={500} value={text}
      onChange={event => { setText(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; }} onKeyDown={onKeyDown} placeholder="Message REIBRY…"/>
      <button type="submit" aria-label="Send message" disabled={!text.trim() || loading}>↑</button></form>
  </PageContainer></RequireAuth>;
}
