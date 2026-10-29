# REIBRY Meta Edition

**From Saved to Done**

A personal AI memory and action platform, developed incrementally for the Meta Global AI Developer Hackathon 2026.

## Current milestone

Stage 7 adds deterministic, owner-scoped lexical search over stored Memory titles, note text, whitelisted source metadata and saved hostnames. Search returns only validated evidence DTOs with exact Memory anchors, bounded note excerpts and transparent ranking reasons. It adds no embeddings, semantic claims or AI calls. Authentication and database access remain disabled by default. **Real Supabase authentication, persistence, hosted RLS and live search are NOT VERIFIED.**

The root page remains an honest development foundation. Its About dialog and unsaved text-field preview are UI demonstrations. Sign in leads to the implemented authentication screen; future product features are absent.

## Run locally

Use Node.js 22.18 or newer and npm. Validation uses Node.js 24.20.0 and npm 11.19.0 on Windows.

~~~sh
npm ci
npm run dev -- --hostname 127.0.0.1
~~~

Open http://127.0.0.1:3000. The public page and auth screen run without secrets or a backend. Missing configuration cannot grant access to `/memories` or its API.

~~~sh
npm run lint
npm run typecheck
npm run build
npm test
npm start -- --hostname 127.0.0.1
~~~

Build before npm test. Tests combine deterministic auth, Memory, Capture and lexical-retrieval behavior, mocked SDK/repository/network responses, static migration checks, and a production localhost smoke test. The smoke server explicitly disables auth and rejects unauthenticated Memory/Capture/search access. It does not create real users, contact hosted Supabase, execute SQL or call a model. The in-memory repository exists only under `tests/support` and cannot be enabled in production.

## Authentication configuration and boundaries

The safe .env.example names four server-only variables: AUTH_ENABLED, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and AUTH_SITE_URL. Keep AUTH_ENABLED=false until a separately approved disposable project is available. Never reuse the original production environment. No credentials have been provisioned or copied. Only a modern Supabase publishable key is accepted; service-role and legacy JWT keys are rejected.

AUTH_SITE_URL must be the exact canonical app origin (HTTPS, or HTTP loopback for local development). A future approved project must allow its /auth/callback redirect and have its email confirmation/PKCE settings verified. Do not enable this against production as a test.

Browser forms use same-origin application endpoints. The server-only Supabase SSR adapter owns HttpOnly, SameSite=Lax, host-scoped cookies, marked Secure on HTTPS. Browser JavaScript receives no session tokens. No custom localStorage/sessionStorage token store or direct browser SDK is needed. Each protected API/page verifies the provider user; client gating is supplementary. Requests fail closed, with eight-second server and twelve-second client deadlines and explicit bounded session retries.

Endpoints: POST /api/auth/sign-in, /api/auth/sign-up, /api/auth/sign-out; GET /api/auth/session, /api/auth/me; GET /auth/callback. The protected /api/auth/me returns only a verified user ID. Sign-out clears this app's cookies even on provider failure when the response reaches the browser; unconfirmed remote revocation is disclosed. A lost transport response requires a retry. See [authentication architecture](docs/meta/AUTH_ARCHITECTURE.md) for the source dependency map and security limits.

## Memory persistence boundary

Memory endpoints are `GET`/`POST /api/memories` and `GET`/`PATCH`/`DELETE /api/memories/{id}`. The direct Memory POST remains basic-text-only. Stage 6 adds authenticated `POST /api/capture` for a note or public HTTPS link; ownership, status, metadata, identifiers and timestamps remain server controlled. Requests use the Stage 4 verified session, are bounded to eight seconds and 64 KiB, require exact same-origin mutation requests, and return private no-store responses. Lists use stable newest-first ordering with `limit` 1–50 and `offset` 0–5,000.

The migration at `supabase/migrations/20261027000000_memory_foundation.sql` is source code only. It creates the independent Meta Edition `memories` table, owner index, timestamp trigger, column-level grants and four owner RLS policies. It has not been applied anywhere. `supabase/tests/memory_rls.sql` is the later disposable-database verification script and must never run against production. See [Memory architecture](docs/meta/MEMORY_ARCHITECTURE.md) for the dependency map and mocked-versus-real verification boundary.

Capture limits notes to 50,000 characters, links to 2,048, titles to 200, and metadata responses to 65,536 bytes with a three-second total deadline. Generic source URLs are never fetched. YouTube/TikTok metadata uses fixed oEmbed hosts, public-address checks, manual redirect rejection and JSON-only streaming. Enrichment failure never discards a valid source. The local `20261027010000_capture_deduplication.sql` migration adds owner/key uniqueness but has not been applied. See [Capture architecture](docs/meta/CAPTURE_ARCHITECTURE.md).

Authenticated `GET /api/memories/search?q=...&limit=...` scans at most the owner's newest 250 Memories and returns 1–20 ranked results. Queries are limited to 200 characters and 12 normalized terms. Only literal evidence is eligible; processing-state Memories remain searchable, unrelated results are not used as padding, and metadata-only links never imply page/video analysis. See [Retrieval architecture](docs/meta/RETRIEVAL_ARCHITECTURE.md).

## Provenance

This edition builds on the original September REIBRY application at source commit 76d3494465bab43a5051498e90b9a486a65312b9. PREEXISTING_WORK.md and docs/meta/MIGRATION_LOG.md preserve the migration history. Stages 1–3 remain intact.

Stage 3 adapted selected original globals.css tokens, the inline brain mark, shell and UI conventions; details are in docs/meta/DESIGN_SYSTEM.md. Stage 4 adapted auth and Supabase session conventions. Stage 5 adapts the original Memory DTO, owner-bound store, Supabase query ordering, API routes and owner RLS. Stage 6 adapts capture and source-preservation patterns. Stage 7 adapts bounded tokenization, weighted literal evidence and stable ranking while excluding source vectors, inferred semantic concepts and AI-generated fields. These remain inherited foundations, not new Meta AI functionality.

Original REIBRY contributors retain attribution and applicable rights. No publication license is inferred. No private or binary assets were copied. The original font stack uses its system fallback because a local font asset's license was not verified.

## Scope and release status

No profiles, onboarding tables, roles, admin model, password recovery, MFA, OAuth, native sessions, arbitrary-page previewing, transcripts, file capture, embeddings, semantic/vector search, Plans, Ready Packs or AI provider implementation are included. Stage 7 adds no dependency; existing direct dependencies remain `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0 and `server-only` 0.0.1.

All milestones remain local. The earlier remote LFS incident is unresolved. No push or remote LFS operation is authorized. The existing untracked recovery report is preserved and is not a release artifact.

Stage 8, only after separate authorization, may add a server-only provider-neutral Muse Spark adapter consuming the bounded retrieval evidence packet. Official readiness facts verified on 2026-10-29 are recorded in [Meta API readiness](docs/meta/META_API_READINESS.md). Model access, billing and credentials remain unverified; `MODEL_API_KEY` has not been added or used.

## Validation limits

The migration log records exact command and browser results. Mocked ownership tests and static SQL checks do not verify PostgreSQL RLS. Real provider settings, session refresh, concurrent database writes and hosted policy behavior remain unverified. No distributed rate limiter, CAPTCHA, screen-reader run or physical-device safe-area test is claimed.

The pre-existing ESLint deprecation warning and unapproved transitive unrs-resolver install script remain unchanged. No additional install-script approval or arbitrary framework workaround was used.
