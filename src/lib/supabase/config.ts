// Server-only values are read by the server adapter, never in a browser component.
import { AuthFailure } from "../auth/policy.ts";
export function authConfig(env: Record<string, string | undefined>) {
  if (env.AUTH_ENABLED !== "true") throw new AuthFailure("AUTH_NOT_CONFIGURED");
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  const site = env.AUTH_SITE_URL;
  try {
    if (!url || !key || !site || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error();
    const provider = new URL(url), app = new URL(site);
    const local = (u: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    for (const u of [provider, app]) {
      if ((u.protocol !== "https:" && !(u.protocol === "http:" && local(u))) || u.username || u.password || u.search || u.hash || u.pathname !== "/") throw new Error();
    }
    if (!local(provider) && !provider.hostname.endsWith(".supabase.co")) throw new Error();
    return { url: provider.origin, key, site: app.origin };
  } catch { throw new AuthFailure("AUTH_NOT_CONFIGURED"); }
}
