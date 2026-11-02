import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ActionRepositoryFailure } from "../actions/repository.ts";
import { authConfig, type AuthEnvironment } from "./config.ts";

export type TrustedSupabaseDependencies = { env: AuthEnvironment & Record<string, string | undefined>; fetch: typeof fetch };

function trustedClient(signal: AbortSignal, dependencies: TrustedSupabaseDependencies, misconfigured: () => Error): SupabaseClient {
  let url: string; let secret: string;
  try {
    url = authConfig(dependencies.env).url;
    secret = dependencies.env.SUPABASE_SECRET_KEY ?? "";
    if (!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(secret)) throw new Error();
  } catch { throw misconfigured(); }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => dependencies.fetch(input, { ...init, signal, cache: "no-store" }) },
  });
}

/**
 * Creates an elevated client solely for the trusted proposal RPC. Never use
 * this client for reads or ordinary owner-scoped persistence.
 */
export function createTrustedProposalClient(signal: AbortSignal,
  dependencies: TrustedSupabaseDependencies = { env: process.env, fetch }): SupabaseClient {
  return trustedClient(signal, dependencies, () => new ActionRepositoryFailure("STORAGE_UNAVAILABLE"));
}

/**
 * Creates an elevated client solely for the trusted link-enrichment RPC, after the caller has verified the
 * session and read the Memory through the owner-bound client. Never use it for reads or other writes.
 */
export function createTrustedEnrichmentClient(signal: AbortSignal,
  dependencies: TrustedSupabaseDependencies = { env: process.env, fetch }): SupabaseClient {
  return trustedClient(signal, dependencies, () => new Error("ENRICHMENT_NOT_CONFIGURED"));
}

/**
 * Creates an elevated client solely for the trusted video RPCs and for uploading an already-validated video into the
 * verified user's own folder. The bucket has no client Storage policies, so downloads and deletes also use this client, but only for
 * a path first read through the owner's own session (memory_videos RLS) and checked to be inside the verified user's folder.
 */
export function createTrustedVideoClient(signal: AbortSignal,
  dependencies: TrustedSupabaseDependencies = { env: process.env, fetch }): SupabaseClient {
  return trustedClient(signal, dependencies, () => new Error("VIDEO_NOT_CONFIGURED"));
}

/**
 * Sole elevated capability for a device-token capture RPC. The RPC itself only
 * accepts a hashed capture credential and can only create a link Memory; never
 * use this client for session reads or general owner-scoped data access.
 */
export function createTrustedShortcutCaptureClient(signal: AbortSignal,
  dependencies: TrustedSupabaseDependencies = { env: process.env, fetch }): SupabaseClient {
  return trustedClient(signal, dependencies, () => new Error("SHORTCUT_CAPTURE_NOT_CONFIGURED"));
}
