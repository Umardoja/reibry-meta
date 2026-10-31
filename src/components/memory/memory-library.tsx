"use client";
// Stage 12J-3: the Memories collection — an image-forward personal atlas of saved discoveries. Search uses the existing owner-scoped
// lexical search; results are shown as the same cards (no scores or engineering reasons). Filters only narrow what is already loaded.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { IC } from "@/components/design/icons";
import { MemoryCard } from "@/components/memory/memory-visual";
import type { Memory } from "@/lib/memory/contracts";
import { presentMemory, type MemoryKind } from "@/lib/memory/presentation";
import type { RetrievalResponse } from "@/lib/retrieval/contracts";

type View = { status: "loading" | "ready" | "error"; items: Memory[]; next: number | null; message: string };
type SearchView = { status: "idle" | "loading" | "ready" | "error"; query: string; items: Memory[]; message: string };
const filters: Array<{ key: MemoryKind | "all"; label: string }> = [{ key: "all", label: "All" }, { key: "tiktok", label: "TikTok" }, { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" }, { key: "web", label: "Web" }, { key: "note", label: "Notes" }, { key: "video", label: "Your videos" }];
const PAGE = 48;

async function getJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
  const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message || "request-failed"); return body?.data;
}
function Card({ memory }: { memory: Memory }) {
  const view = presentMemory(memory);
  return <li id={`memory-${memory.id}`}><MemoryCard view={view} excerpt={view.kind === "note" ? memory.rawText : null} /></li>;
}

export function MemoryLibrary() {
  const [view, setView] = useState<View>({ status: "loading", items: [], next: null, message: "" });
  const [search, setSearch] = useState<SearchView>({ status: "idle", query: "", items: [], message: "" });
  const [filter, setFilter] = useState<MemoryKind | "all">("all");
  const [query, setQuery] = useState(""); const [loadingMore, setLoadingMore] = useState(false);
  const searchSeq = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true; const timer = setTimeout(() => controller.abort(), 12_000);
    void getJson(`/api/memories?limit=${PAGE}`, controller.signal).then(data => {
      if (!active) return; if (!Array.isArray(data?.items)) throw new Error();
      setView({ status: "ready", items: data.items, next: data.nextOffset ?? null, message: "" });
    }).catch(() => { if (active) setView({ status: "error", items: [], next: null, message: "Your Memories couldn't be loaded. Check your connection and try again." }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);
  async function loadMore() {
    if (view.next === null || loadingMore) return; setLoadingMore(true);
    try { const data = await getJson(`/api/memories?limit=${PAGE}&offset=${view.next}`, AbortSignal.timeout(12_000));
      setView(current => ({ ...current, items: [...current.items, ...data.items.filter((item: Memory) => !current.items.some(existing => existing.id === item.id))], next: data.nextOffset ?? null })); }
    catch { setView(current => ({ ...current, message: "More Memories couldn't be loaded. Try again." })); } finally { setLoadingMore(false); }
  }
  async function runSearch(text: string) {
    const seq = ++searchSeq.current; setSearch({ status: "loading", query: text, items: [], message: "" });
    try {
      const data = await getJson(`/api/memories/search?q=${encodeURIComponent(text)}&limit=20`, AbortSignal.timeout(12_000)) as RetrievalResponse;
      // Results arrive as references; show each as its full card (owner-scoped reads, already-loaded ones reused).
      const known = new Map(view.items.map(item => [item.id, item]));
      const items = (await Promise.all(data.items.map(async item => known.get(item.memoryId) ?? await getJson(`/api/memories/${item.memoryId}`, AbortSignal.timeout(12_000)).catch(() => null))))
        .filter((item): item is Memory => !!item);
      if (seq === searchSeq.current) setSearch({ status: "ready", query: text, items, message: "" });
    } catch { if (seq === searchSeq.current) setSearch({ status: "error", query: text, items: [], message: "Search didn't work this time. Try again." }); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const text = query.trim(); if (text && search.status !== "loading") void runSearch(text); }
  function clear() { searchSeq.current++; setQuery(""); setSearch({ status: "idle", query: "", items: [], message: "" }); }
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const item of view.items) { const kind = presentMemory(item).kind; map.set(kind, (map.get(kind) ?? 0) + 1); } return map; }, [view.items]);
  const shown = (search.status === "ready" ? search.items : view.items).filter(item => filter === "all" || presentMemory(item).kind === filter);
  const total = view.items.length;

  return <RequireAuth nextPath="/memories">
    <header className="page-hero"><p className="eyebrow">Your memories</p><h1>Everything you saved, in one place.</h1>
      <p>{view.status === "ready" && total ? `${total}${view.next !== null ? "+" : ""} saved discoveries, ready when you need them.` : "The useful things you find every day, kept for later."}</p></header>
    {(view.status !== "ready" || total > 0) && <div className="library-toolbar">
      <form className="search-pill" role="search" onSubmit={submit}>
        {IC.search}<label htmlFor="memory-query" className="sr-only">Search your Memories</label>
        <input id="memory-query" name="query" type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="Search titles, creators, notes…" enterKeyHint="search" />
        {(query || search.status !== "idle") && <button type="button" className="icon-button" onClick={clear} aria-label="Clear search">{IC.close}</button>}
        <button type="submit" className="icon-button search-go" disabled={!query.trim() || search.status === "loading"}>{search.status === "loading" ? "…" : "Search"}</button>
      </form>
      {view.status === "ready" && counts.size > 1 && <div className="chip-row" role="group" aria-label="Filter by type">
        {filters.filter(item => item.key === "all" || counts.has(item.key)).map(item => <button key={item.key} type="button" className="chip" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
          {item.label}{item.key !== "all" && <span className="count">{counts.get(item.key)}</span>}</button>)}
      </div>}
    </div>}
    {search.status === "error" && <div className="notice" role="alert"><p>{search.message}</p><div className="inline-actions"><button type="button" className="btn-soft" onClick={() => void runSearch(search.query)}>Try again</button></div></div>}
    {search.status !== "idle" && search.status !== "error" && <div className="collection-heading"><h2>{search.status === "loading" ? "Searching…" : search.items.length ? `Results for “${search.query}”` : `Nothing saved matches “${search.query}”`}</h2>
      {search.status === "ready" && <p>{search.items.length ? `${search.items.length} found` : "Try a creator, a word from your note or the platform name."}</p>}</div>}
    {(view.status === "loading" || search.status === "loading") && <ul className="skeleton-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <li key={index} className="skeleton-card"><span /><span /><span /></li>)}</ul>}
    {view.status === "loading" && <p className="sr-only" role="status">Loading your Memories…</p>}
    {view.status === "error" && <div className="notice" role="alert"><h2>Couldn&apos;t load your Memories</h2><p>{view.message}</p>
      <div className="inline-actions"><button type="button" className="btn-soft" onClick={() => window.location.reload()}>Try again</button></div></div>}
    {view.status === "ready" && total === 0 && <section className="empty-state"><div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
      <h2>Nothing saved yet</h2><p>Found something worth keeping — a recipe, a video, a place, an idea? Save it here and REIBRY will remember it for you.</p>
      <Link href="/capture" className="button btn-primary">Save your first Memory</Link></section>}
    {view.status === "ready" && search.status !== "loading" && shown.length > 0 && <ul className="memory-grid" aria-label={search.status === "ready" ? "Search results" : "Saved Memories"}>{shown.map(item => <Card key={item.id} memory={item} />)}</ul>}
    {view.status === "ready" && search.status === "idle" && total > 0 && shown.length === 0 && <p className="field-hint">Nothing of this type yet.</p>}
    {view.status === "ready" && search.status === "idle" && view.next !== null && <div className="load-more"><button type="button" className="button btn-ghost" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more"}</button></div>}
    {view.message && view.status === "ready" && <p className="auth-error" role="alert">{view.message}</p>}
  </RequireAuth>;
}
