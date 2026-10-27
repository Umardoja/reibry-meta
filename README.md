# REIBRY Meta Edition

**From Saved to Done**

A personal AI memory and action platform, developed incrementally for the Meta Global AI Developer Hackathon 2026.

## Current milestone

Stage 5 adds the secure Memory and persistence foundation to the Stage 4 authentication system: validated Memory contracts, owner-bound repositories, authenticated CRUD APIs, a minimal real-records-only Memories page, and a local SQL migration with row-level security. Authentication and database access remain disabled by default. **Real Supabase authentication and hosted RLS are NOT VERIFIED.**

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

Build before npm test. Tests combine deterministic auth and Memory behavior, mocked SDK/repository responses, static migration checks, and a production localhost smoke test. The smoke server explicitly disables auth, rejects unauthenticated Memory API/page access, and shuts down afterward. It does not create real users, contact hosted Supabase or execute SQL. The in-memory repository exists only under `tests/support` and cannot be enabled in production. Next.js generates ignored next-env.d.ts; dependencies, `.next` and TypeScript output remain ignored.

## Authentication configuration and boundaries

The safe .env.example names four server-only variables: AUTH_ENABLED, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and AUTH_SITE_URL. Keep AUTH_ENABLED=false until a separately approved disposable project is available. Never reuse the original production environment. No credentials have been provisioned or copied. Only a modern Supabase publishable key is accepted; service-role and legacy JWT keys are rejected.

AUTH_SITE_URL must be the exact canonical app origin (HTTPS, or HTTP loopback for local development). A future approved project must allow its /auth/callback redirect and have its email confirmation/PKCE settings verified. Do not enable this against production as a test.

Browser forms use same-origin application endpoints. The server-only Supabase SSR adapter owns HttpOnly, SameSite=Lax, host-scoped cookies, marked Secure on HTTPS. Browser JavaScript receives no session tokens. No custom localStorage/sessionStorage token store or direct browser SDK is needed. Each protected API/page verifies the provider user; client gating is supplementary. Requests fail closed, with eight-second server and twelve-second client deadlines and explicit bounded session retries.

Endpoints: POST /api/auth/sign-in, /api/auth/sign-up, /api/auth/sign-out; GET /api/auth/session, /api/auth/me; GET /auth/callback. The protected /api/auth/me returns only a verified user ID. Sign-out clears this app's cookies even on provider failure when the response reaches the browser; unconfirmed remote revocation is disclosed. A lost transport response requires a retry. See [authentication architecture](docs/meta/AUTH_ARCHITECTURE.md) for the source dependency map and security limits.

## Memory persistence boundary

Memory endpoints are `GET`/`POST /api/memories` and `GET`/`PATCH`/`DELETE /api/memories/{id}`. Stage 5 accepts basic text persistence only. Clients may supply `rawText` and an optional `title`; `userId`, status, metadata, identifiers and timestamps are server controlled. Requests use the Stage 4 verified session, are bounded to eight seconds and 64 KiB, require exact same-origin mutation requests, and return private no-store responses. Lists use stable newest-first ordering with `limit` 1–50 and `offset` 0–5,000.

The migration at `supabase/migrations/20261027000000_memory_foundation.sql` is source code only. It creates the independent Meta Edition `memories` table, owner index, timestamp trigger, column-level grants and four owner RLS policies. It has not been applied anywhere. `supabase/tests/memory_rls.sql` is the later disposable-database verification script and must never run against production. See [Memory architecture](docs/meta/MEMORY_ARCHITECTURE.md) for the dependency map and mocked-versus-real verification boundary.

## Provenance

This edition builds on the original September REIBRY application at source commit 76d3494465bab43a5051498e90b9a486a65312b9. PREEXISTING_WORK.md and docs/meta/MIGRATION_LOG.md preserve the migration history. Stages 1–3 remain intact.

Stage 3 adapted selected original globals.css tokens, the inline brain mark, shell and UI conventions; details are in docs/meta/DESIGN_SYSTEM.md. Stage 4 adapted auth and Supabase session conventions. Stage 5 adapts the original Memory DTO, owner-bound store, Supabase query ordering, API routes and owner RLS. Bounded requests, a smaller contract and strict production/test separation are Meta Edition adaptations. These remain inherited foundations, not new Meta AI functionality.

Original REIBRY contributors retain attribution and applicable rights. No publication license is inferred. No private or binary assets were copied. The original font stack uses its system fallback because a local font asset's license was not verified.

## Scope and release status

No profiles, onboarding tables, roles, admin model, password recovery, MFA, OAuth, native sessions, Capture, enrichment, retrieval, embeddings, Plans, Ready Packs or AI providers are included. The Memory page displays only records returned by the authenticated API and has no capture form. Stage 5 adds no dependency; existing direct dependencies remain `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0 and `server-only` 0.0.1.

All milestones remain local. The earlier remote LFS incident is unresolved. No push or remote LFS operation is authorized. The existing untracked recovery report is preserved and is not a release artifact.

Stage 6, only after separate authorization, should add text/link capture, safe source preservation, enrichment and deduplication on top of this repository. It must not add retrieval, AI analysis or production migrations by implication. Live auth and RLS verification still require separate approval for a disposable project.

## Validation limits

The migration log records exact command and browser results. Mocked ownership tests and static SQL checks do not verify PostgreSQL RLS. Real provider settings, session refresh, concurrent database writes and hosted policy behavior remain unverified. No distributed rate limiter, CAPTCHA, screen-reader run or physical-device safe-area test is claimed.

The pre-existing ESLint deprecation warning and unapproved transitive unrs-resolver install script remain unchanged. No additional install-script approval or arbitrary framework workaround was used.
