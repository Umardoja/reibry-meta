# REIBRY Meta Edition

**From Saved to Done**

A personal AI memory and action platform, developed incrementally for the Meta Global AI Developer Hackathon 2026.

## Current milestone

Stage 4 adds the authentication foundation to the Stage 3 REIBRY design system: sign-in/sign-up forms, password visibility, confirmation callback, session checks, sign-out, and a server-protected account-access page. Authentication is disabled by default. **Real Supabase authentication is NOT VERIFIED.** The account page contains no profile, dashboard or product data.

The root page remains an honest development foundation. Its About dialog and unsaved text-field preview are UI demonstrations. Sign in leads to the implemented authentication screen; future product features are absent.

## Run locally

Use Node.js 22.18 or newer and npm. Validation uses Node.js 24.20.0 and npm 11.19.0 on Windows.

~~~sh
npm ci
npm run dev -- --hostname 127.0.0.1
~~~

Open http://127.0.0.1:3000. The public page and auth screen run without secrets or a backend. Missing auth configuration produces a clear failure and cannot grant access.

~~~sh
npm run lint
npm run typecheck
npm run build
npm test
npm start -- --hostname 127.0.0.1
~~~

Build before npm test. Tests combine deterministic auth behavior and mocked actual SDK responses with a production localhost HTTP smoke test. The smoke server explicitly disables auth, checks public pages/CSS, rejects unauthenticated protected requests, verifies missing configuration and CSRF rejection, and shuts down afterward. It does not create real users or call hosted Supabase. Test-only adapters cannot be enabled in production. Next.js generates ignored next-env.d.ts; dependencies, .next and TypeScript output remain ignored.

## Authentication configuration and boundaries

The safe .env.example names four server-only variables: AUTH_ENABLED, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and AUTH_SITE_URL. Keep AUTH_ENABLED=false until a separately approved disposable project is available. Never reuse the original production environment. No credentials have been provisioned or copied. Only a modern Supabase publishable key is accepted; service-role and legacy JWT keys are rejected.

AUTH_SITE_URL must be the exact canonical app origin (HTTPS, or HTTP loopback for local development). A future approved project must allow its /auth/callback redirect and have its email confirmation/PKCE settings verified. Do not enable this against production as a test.

Browser forms use same-origin application endpoints. The server-only Supabase SSR adapter owns HttpOnly, SameSite=Lax, host-scoped cookies, marked Secure on HTTPS. Browser JavaScript receives no session tokens. No custom localStorage/sessionStorage token store or direct browser SDK is needed. Each protected API/page verifies the provider user; client gating is supplementary. Requests fail closed, with eight-second server and twelve-second client deadlines and explicit bounded session retries.

Endpoints: POST /api/auth/sign-in, /api/auth/sign-up, /api/auth/sign-out; GET /api/auth/session, /api/auth/me; GET /auth/callback. The protected /api/auth/me returns only a verified user ID. Sign-out clears this app's cookies even on provider failure when the response reaches the browser; unconfirmed remote revocation is disclosed. A lost transport response requires a retry. See [authentication architecture](docs/meta/AUTH_ARCHITECTURE.md) for the source dependency map and security limits.

## Provenance

This edition builds on the original September REIBRY application at source commit 76d3494465bab43a5051498e90b9a486a65312b9. PREEXISTING_WORK.md and docs/meta/MIGRATION_LOG.md preserve the migration history. Stages 1–3 remain intact.

Stage 3 adapted selected original globals.css tokens, the inline brain mark, shell and UI conventions; details are in docs/meta/DESIGN_SYSTEM.md. Stage 4 adapts lib/auth, lib/supabase, components/auth and app/auth conventions. Bounded requests, minimal responses, strict redirect allowlisting, isolated cookies and deterministic behavioral tests are adaptations in this edition. Authentication and design are inherited foundations, not new Meta AI functionality. Source tests do not establish that the original production authentication bug is fixed.

Original REIBRY contributors retain attribution and applicable rights. No publication license is inferred. No private or binary assets were copied. The original font stack uses its system fallback because a local font asset's license was not verified.

## Scope and release status

No profiles, onboarding tables, roles, admin model, password recovery, MFA, OAuth, native sessions, Memories, Capture, retrieval, Plans, Ready Packs, AI providers or migrations are included. Added dependencies are @supabase/ssr 0.12.7, @supabase/supabase-js 2.116.0 and server-only 0.0.1; no UI/test framework was added.

All milestones remain local. The earlier remote LFS incident is unresolved. No push or remote LFS operation is authorized. The existing untracked recovery report is preserved and is not a release artifact.

Stage 5, only after separate authorization, should add the minimal Memory/persistence foundation with ownership checks and mocked storage tests. Production schema changes and broader product workflows remain outside that boundary. Live auth/refresh/confirmation/revocation verification requires separate approval for a disposable project before deployment.

## Validation limits

The migration log records exact command and browser results. Mocked tests do not verify real provider settings, email delivery, refresh rotation or concurrency across live tabs. No distributed rate limiter or CAPTCHA is implemented; provider anti-abuse settings require deployment review. No screen-reader or physical-device safe-area test is claimed.

The pre-existing ESLint deprecation warning and unapproved transitive unrs-resolver install script remain unchanged. No additional install-script approval or arbitrary framework workaround was used.
