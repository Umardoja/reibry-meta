"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/auth/require-auth";
import type { Memory } from "@/lib/memory/contracts";
type View = { status: "loading" | "ready" | "error"; items: Memory[]; message: string };
export function MemoryLibrary() {
  const [view, setView] = useState<View>({ status: "loading", items: [], message: "" });
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
  return <RequireAuth>
    {view.status === "loading" && <p role="status">Loading your Memories… This request is limited to 12 seconds.</p>}
    {view.status === "error" && <p role="alert" className="auth-error">{view.message}</p>}
    {view.status === "ready" && view.items.length === 0 && <Card><h2>No Memories yet</h2><p>Basic text Memory persistence is ready. Capture arrives in the next milestone.</p></Card>}
    {view.status === "ready" && view.items.length > 0 && <ul className="memory-list" aria-label="Saved Memories">{view.items.map(item =>
      <li key={item.id}><Card><h2>{item.title}</h2><p>{item.sourceType === "text" ? "Text Memory" : "Link Memory"} · {new Date(item.createdAt).toLocaleDateString()}</p></Card></li>)}</ul>}
  </RequireAuth>;
}
