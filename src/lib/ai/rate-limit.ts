import "server-only";
export type AskRateLimiter = { consume(userId: string): boolean };
export function createInMemoryAskRateLimiter(limit = 5, windowMs = 60_000, now: () => number = Date.now): AskRateLimiter {
  const entries = new Map<string, number[]>();
  return { consume(userId) {
    const cutoff = now() - windowMs; const recent = (entries.get(userId) || []).filter(value => value > cutoff);
    if (recent.length >= limit) { entries.set(userId, recent); return false; }
    recent.push(now()); entries.set(userId, recent);
    if (entries.size > 1_000) for (const [id, values] of entries) if (!values.some(value => value > cutoff)) entries.delete(id);
    return true;
  } };
}
