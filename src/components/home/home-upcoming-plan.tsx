"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Plan } from "@/lib/plans/contracts";

/** A quiet, owner-scoped rediscovery cue. It never estimates task completion. */
export function HomeUpcomingPlan() {
  const [upcoming, setUpcoming] = useState<{ plan: Plan; label: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/plans?limit=6", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(body => {
        const now = Date.now();
        const next = Array.isArray(body?.data) ? (body.data as Plan[])
          .filter(item => item.status === "active" && item.startDate && Date.parse(item.startDate) >= now)
          .sort((a, b) => Date.parse(a.startDate!) - Date.parse(b.startDate!) || a.id.localeCompare(b.id))[0] ?? null : null;
        if (!next?.startDate) return setUpcoming(null);
        const days = Math.max(0, Math.ceil((Date.parse(next.startDate) - now) / 86_400_000));
        setUpcoming({ plan: next, label: days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days` });
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!upcoming) return null;
  return <Link className="home-upcoming-plan" href={`/plans/${upcoming.plan.id}`}>
    <span className="section-label">Coming up</span><strong>{upcoming.plan.title}</strong><small>{upcoming.label} · Open Plan</small>
  </Link>;
}
