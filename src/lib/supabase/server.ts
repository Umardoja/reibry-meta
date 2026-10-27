import "server-only";
// Adapted from original REIBRY lib/supabase/server.ts and lib/auth/service.ts.
// Source 76d3494465bab43a5051498e90b9a486a65312b9; original contributors retain attribution.
import { createServerClient } from "@supabase/ssr";
import { authConfig } from "./config.ts";
import { cookieJar, cookieKey } from "./cookies.ts";
import { AuthFailure, missingSession, providerFailure } from "../auth/policy.ts";
import type { AuthAdapter } from "../auth/handler.ts";

export function createAuthAdapter(jar: ReturnType<typeof cookieJar>, signal: AbortSignal, requestOrigin?: string, dependencies: { env: Record<string, string | undefined>; fetch: typeof fetch } = { env: process.env, fetch }): AuthAdapter {
  const config = authConfig(dependencies.env);
  if (requestOrigin && requestOrigin !== config.site) throw new AuthFailure("AUTH_NOT_CONFIGURED");
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { name: cookieKey, path: "/", httpOnly: true, sameSite: "lax", secure: config.site.startsWith("https:") },
    cookies: { getAll: jar.getAll, setAll: items => jar.setAll(items, signal) },
    global: { fetch: (input, init) => dependencies.fetch(input, { ...init, signal, cache: "no-store" }) },
  });
  return {
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw providerFailure(error);
      if (!data.session || !data.user) throw new AuthFailure("AUTH_UNAVAILABLE");
    },
    async signUp(email, password, next) {
      const callback = new URL("/auth/callback", config.site);
      callback.searchParams.set("next", next);
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } });
      // Preserve provider account-obscuring behavior rather than disclose email existence.
      if (error && ["user_already_exists", "email_exists"].includes(error.code || "")) return { requiresConfirmation: true };
      if (error) throw providerFailure(error);
      return { requiresConfirmation: !data.session };
    },
    async verify() {
      const { data, error } = await client.auth.getUser();
      if (error) {
        if (missingSession(error)) return null;
        throw providerFailure(error);
      }
      return data.user?.id ? { id: data.user.id } : null;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw providerFailure(error);
    },
    async exchange(code) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw new AuthFailure("INVALID_CALLBACK");
    },
  };
}
