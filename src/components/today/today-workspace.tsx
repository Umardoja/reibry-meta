"use client";
// Composition ported from REIBRY Original app/today/page.tsx at 76d3494.
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { StatePanel } from "@/components/ui/primitives";
import type { TodayFeed, TodayLifeItem, TodayResurfacedMemory } from "@/lib/today/contracts";

type View = { state: "loading" | "ready" | "error"; data: TodayFeed | null; message: string };

function CompactLifeRow({ context }: { context: TodayLifeItem }) {
  const date = new Date(context.startDate!); const valid = !Number.isNaN(date.getTime());
  const day = valid ? new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(date) : "Soon";
  const time = valid ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date) : "";
  return <Link href={context.href} className="today-life-row"><span className="today-life-date">{day}</span><span className="today-life-title">{context.title}</span><span className="today-life-time">{time}</span></Link>;
}

function TodayCard({ item, hero }: { item: TodayResurfacedMemory; hero: boolean }) {
  return <article className={hero ? "hero-card" : "compact-card"}><div className={hero ? "hero-body" : ""}>
    <div className="compact-source-row"><span className="compact-source">{item.sourceLabel}</span><span className="compact-saved">{item.processingStatus}</span></div>
    <span className="why-now-pill">Why now</span><Link className="life-pill" href={item.lifeContext.href}>{item.lifeContext.title}</Link>
    <h2 className={hero ? "hero-title" : "compact-title"}><Link href={item.memoryHref}>{item.displayTitle}</Link></h2>
    {item.storedExcerpt ? <p className={hero ? "hero-desc" : "compact-desc"}>{item.storedExcerpt}</p> :
      <p className={hero ? "hero-desc" : "compact-desc"}>Metadata-only saved link. REIBRY has not read a webpage or video transcript.</p>}
    <div className="why-box"><h3 className="why-box-title">Why this came back</h3><p className="why-box-text">{item.reason}</p></div>
  </div></article>;
}

export function TodayWorkspace() {
  const [view, setView] = useState<View>({ state: "loading", data: null, message: "" });
  useEffect(() => { let active = true; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    void fetch("/api/today", { cache: "no-store", credentials: "same-origin", signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok || !body?.data || !Array.isArray(body.data.upcomingLifeContexts) || !Array.isArray(body.data.resurfacedMemories))
        throw new Error(body?.error?.message || "Unable to load Today.");
      if (active) setView({ state: "ready", data: body.data, message: "" });
    }).catch(cause => { if (active) setView({ state: "error", data: null, message: cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Today took too long to load." }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);
  return <RequireAuth>
    <div className="today-meta-row"><p className="section-label">Why now</p></div>
    <div className="today-greeting"><h1 className="greeting-h">Here&apos;s what matters today</h1><p className="greeting-hint">A few things you saved, ready when they matter.</p></div>
    {view.state === "loading" && <div className="px"><StatePanel>Loading your day…</StatePanel></div>}
    {view.state === "error" && <div className="px"><StatePanel tone="error">{view.message}<button className="button btn-ghost" type="button" onClick={() => window.location.reload()}>Try again</button></StatePanel></div>}
    {view.state === "ready" && view.data && <>
      <section className="resurfaced-list" aria-label="Resurfaced for you">
        {!view.data.resurfacedMemories.length ? <StatePanel>No resurfaced Memories yet. Save something and add a dated Life event — REIBRY will only connect them when stored evidence supports the match.</StatePanel> :
          view.data.resurfacedMemories.map((item, index) => <TodayCard key={`${item.memoryId}-${item.lifeContext.id}`} item={item} hero={index === 0} />)}
      </section>
      {view.data.upcomingLifeContexts.length > 0 ? <section className="today-secondary"><div className="results-header"><h2 className="section-heading">Upcoming Life</h2><Link href="/life">View Life</Link></div>
        <div className="today-life-list">{view.data.upcomingLifeContexts.map(context => <CompactLifeRow key={context.id} context={context} />)}</div></section> :
        <section className="today-secondary"><StatePanel>No upcoming Life contexts. <Link href="/life">Add what matters next</Link>.</StatePanel></section>}
    </>}
  </RequireAuth>;
}
