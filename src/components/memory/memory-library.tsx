"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/auth/require-auth";
import type { Memory } from "@/lib/memory/contracts";
import type { RetrievalResponse } from "@/lib/retrieval/contracts";
type View = { status: "loading" | "ready" | "error"; items: Memory[]; message: string };
type SearchView = { status: "idle" | "loading" | "ready" | "error"; response: RetrievalResponse | null; message: string; query: string };
export function MemoryLibrary() {
  const [view, setView] = useState<View>({ status: "loading", items: [], message: "" });
  const [search, setSearch] = useState<SearchView>({ status: "idle", response: null, message: "", query: "" });
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 12_000);
    void fetch("/api/memories?limit=20", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body?.data?.items)) throw new Error();
        setView({ status: "ready", items: body.data.items, message: "" });
      }).catch(() => { if (active) setView({ status: "error", items: [], message: "Memories could not be loaded. Try again after checking database configuration." }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, []);
  async function runSearch(query: string) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    setSearch({ status: "loading", response: null, message: "", query });
    try {
      const response = await fetch(`/api/memories/search?q=${encodeURIComponent(query)}&limit=10`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.data?.items)) throw new Error(body?.error?.message || "Memory search failed.");
      setSearch({ status: "ready", response: body.data, message: "", query });
    } catch (cause) {
      setSearch({ status: "error", response: null, message: cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Memory search took too long. Try again.", query });
    } finally { clearTimeout(timer); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const query = String(data.get("query") || "").trim();
    if (query && search.status !== "loading") void runSearch(query);
  }
  return <RequireAuth>
    <form className="memory-search" role="search" onSubmit={submit}>
      <div className="field"><label htmlFor="memory-query">Search your stored evidence</label>
        <input className="input" id="memory-query" name="query" maxLength={200} required placeholder="Try a saved title, note phrase, author or hostname" />
        <p className="field-hint">Lexical search only. Results contain stored evidence, not AI interpretation.</p></div>
      <button className="button btn-primary" type="submit" disabled={search.status === "loading"}>{search.status === "loading" ? "Searching…" : "Search Memories"}</button>
    </form>
    {search.status === "loading" && <p className="search-feedback" role="status">Searching up to 250 of your newest Memories…</p>}
    {search.status === "error" && <div className="search-feedback"><p className="auth-error" role="alert">{search.message}</p>
      <button className="button btn-ghost" type="button" onClick={() => void runSearch(search.query)}>Retry search</button></div>}
    {search.status === "ready" && search.response?.state === "no-match" && <Card><h2>No matching evidence</h2><p>No stored Memory supports “{search.response.query}”. Nothing unrelated was added.</p></Card>}
    {search.status === "ready" && search.response?.state === "matches" && <section className="search-results" aria-labelledby="search-results-heading">
      <h2 id="search-results-heading">Matching evidence</h2><ul className="memory-list">{search.response.items.map(item => <li key={item.memoryId}>
        <Card><a className="memory-title-link" href={item.memoryHref}><h3>{item.displayTitle}</h3></a>
          {item.storedExcerpt ? <p className="memory-excerpt">{item.storedExcerpt}</p> : item.sourceType === "link" ? <p>Metadata-only link evidence; webpage or video content was not retrieved.</p> : null}
          {item.sourceUrl && <p className="source-value">{item.sourceUrl}</p>}
          <p>{item.match.reason} Score {item.match.score}/100 · {item.processingStatus}</p></Card></li>)}</ul></section>}
    {view.status === "loading" && <p role="status">Loading your Memories… This request is limited to 12 seconds.</p>}
    {view.status === "error" && <p role="alert" className="auth-error">{view.message}</p>}
    {view.status === "ready" && view.items.length === 0 && <Card><h2>No Memories yet</h2><p><a href="/capture">Capture a note or link</a> to create your first Memory.</p></Card>}
    {view.status === "ready" && view.items.length > 0 && <ul className="memory-list" aria-label="Saved Memories">{view.items.map(item =>
      <li key={item.id} id={`memory-${item.id}`}><Card><a className="memory-title-link" href={`/memories/${item.id}`}><h2>{item.title}</h2></a><p>{item.sourceType === "text" ? "Text Memory" : [({ youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" } as Record<string, string>)[String(item.metadata.platform)] ?? "Link", typeof item.metadata.author === "string" ? item.metadata.author : null].filter(Boolean).join(" · ")} · {item.analysisStatus} · {new Date(item.createdAt).toLocaleDateString()}</p></Card></li>)}</ul>}
  </RequireAuth>;
}
