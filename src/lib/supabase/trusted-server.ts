import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ActionRepositoryFailure } from "../actions/repository.ts";
import { authConfig, type AuthEnvironment } from "./config.ts";

export type TrustedSupabaseDependencies = { env: AuthEnvironment & Record<string, string | undefined>; fetch: typeof fetch };

/**
 * Creates an elevated client solely for the trusted proposal RPC. Never use
 * this client for reads or ordinary owner-scoped persistence.
 */
export function createTrustedProposalClient(signal: AbortSignal,
  dependencies: TrustedSupabaseDependencies = { env: process.env, fetch }): SupabaseClient {
  let url: string; let secret: string;
  try {
    url = authConfig(dependencies.env).url;
    secret = dependencies.env.SUPABASE_SECRET_KEY ?? "";
    if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secret)) throw new Error();
  } catch { throw new ActionRepositoryFailure("STORAGE_UNAVAILABLE"); }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => dependencies.fetch(input, { ...init, signal, cache: "no-store" }) },
  });
}
