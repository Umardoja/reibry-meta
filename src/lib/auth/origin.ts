import { AuthFailure } from "./policy.ts";
const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
export function canonicalOrigin(request: Request, configured?: string) {
  if (configured) {
    try {
      const site = new URL(configured);
      if ((site.protocol !== "https:" && !(site.protocol === "http:" && loopback(site.hostname))) || site.username || site.password || site.pathname !== "/" || site.search || site.hash) throw new Error();
      return site.origin;
    } catch { throw new AuthFailure("AUTH_NOT_CONFIGURED"); }
  }
  const url = new URL(request.url);
  // Next normalizes loopback URLs. Preserve the actual loopback Host, never an arbitrary forwarded host.
  const host = request.headers.get("host");
  if (loopback(url.hostname) && host) {
    try {
      const actual = new URL(url.protocol + "//" + host);
      if (loopback(actual.hostname) && actual.port === url.port && actual.host === host) return actual.origin;
    } catch { /* Fall through to framework URL. */ }
  }
  return url.origin;
}
