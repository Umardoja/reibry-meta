import type { CookieOptions } from "@supabase/ssr";
export const cookieKey = "reibry-meta-auth";
export type Cookie = { name: string; value: string };
export type CookieWrite = Cookie & { options: CookieOptions };
export function isAuthCookie(name: string) {
  return /^reibry-meta-auth(?:\.\d+|-code-verifier(?:\.\d+)?)?$/.test(name);
}
export function cookieJar(incoming: Cookie[]) {
  const values = new Map(incoming.filter(c => isAuthCookie(c.name)).map(c => [c.name, c.value]));
  const pending = new Map<string, CookieWrite>();
  return {
    getAll: () => Array.from(values, ([name, value]) => ({ name, value })),
    writes: () => Array.from(pending.values()),
    setAll: (items: CookieWrite[], signal: AbortSignal) => {
      if (signal.aborted) return; // Never persist a provider result arriving after timeout.
      for (const item of items) if (isAuthCookie(item.name)) {
        pending.set(item.name, item); values.set(item.name, item.value);
      }
    },
    clear: () => Array.from(new Set([cookieKey, cookieKey + "-code-verifier", ...values.keys(), ...pending.keys()]),
      name => ({ name, value: "", options: { maxAge: 0, expires: new Date(0) } } satisfies CookieWrite)),
  };
}
