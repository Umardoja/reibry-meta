# REIBRY Meta Edition

**From Saved to Done.** A personal memory and action app for the Meta Global AI
Developer Hackathon 2026. Save notes and links, see what matters today, ask
grounded questions, and turn answers into confirmed actions, Plans and Ready
Packs.

## What it does

- **Capture → Memories.** Save notes and public links. The original source is
  preserved, and links are recorded as metadata only (no claimed video or page
  analysis). Search is lexical and owner-bound.
- **Life and Today.** Describe what's coming up ("Trip to Lagos tomorrow").
  Today lists upcoming Life contexts and resurfaces related Memories, with a
  plain "why this came back" explanation.
- **Ask REIBRY (Meta Muse Spark).** Ask a question about your own saved items.
  The answer comes from Meta Muse Spark (`muse-spark-1.3`) through the
  Responses API, with a strict JSON schema, `store=false` and no tools. Every
  citation must be one of the caller's own Memories, or the answer is rejected.
- **Confirmed actions.** Muse may propose next steps. They are stored as inert
  proposals. Only the user's explicit confirmation creates an Action Card, and
  confirming is idempotent.
- **Plans and Ready Packs.** Group Memories and Life context into a Plan, then
  build a travel, event or learning Ready Pack from Memories attached to that
  Plan, choosing each item explicitly. The pack has a persisted, versioned
  checklist.

## Built with Meta

`POST https://api.meta.ai/v1/responses` is called only on the server
(`src/lib/ai/meta/`).

| Control | Detail |
| --- | --- |
| Output | 800-token cap, at most 2 attempts with bounded backoff, 12 s per-attempt timeout |
| Input | Evidence capped at 12 KB; URL credentials, query strings and fragments are stripped |
| Validation | The response is validated at runtime: citation membership, grounding, and suggested-step references |
| Errors | Fail closed with clear error states; there is no mock fallback in production |

**Proposals.** Suggested steps are persisted only by a server-only database
function. It runs after the server has verified the user session and validated
the Muse output. Browsers and anonymous callers cannot create proposals.

**Live verification.** A synthetic request was verified live in Stage 12D:
HTTP 200, structured output, and passing citation validation, using 644 tokens
at an estimated $0.0015.

## Security and data model

**Sessions:**

- Supabase Auth with a server-side PKCE flow.
- HttpOnly, SameSite=Lax, host-scoped cookies.
- Every API route and protected page re-verifies the user with `getUser()`.
- Every write requires an exact same-origin request.
- No secrets or tokens reach the browser.

**Database:**

- 11 PostgreSQL tables with **forced row-level security**.
- Owner-bound composite foreign keys.
- Writes go through fixed `SECURITY DEFINER` functions with pinned
  `search_path`, `auth.uid()` checks, idempotency keys, and optimistic
  versions. A stale version returns HTTP 409 immediately.
- `anon` can execute no application function.

**Verified live** (Stages 12E–12F) on a disposable Supabase project with two
real users, in both directions, through both the app API and the Supabase Data
API:

- isolation;
- persistence after refresh;
- trusted-proposal boundaries;
- concurrency;
- conflict handling.

See [HOSTED_AUTH_PERSISTENCE_RESULTS.md](docs/meta/HOSTED_AUTH_PERSISTENCE_RESULTS.md)
and [POSTGREST_CONFLICT_FIX.md](docs/meta/POSTGREST_CONFLICT_FIX.md).

## Run locally

Requirements: Node.js 22.18 or newer, npm, and a **disposable** Supabase
project with the migrations in `supabase/migrations/` applied. Never use a
production project.

```sh
npm ci
npm run build
npm start -- --hostname localhost      # http://localhost:3000
npm run lint && npm run typecheck && npm test
```

Server-only environment variables go in `.env.local`, which is git-ignored.
Never prefix them with `NEXT_PUBLIC_`.

| Name | Purpose |
| --- | --- |
| `AUTH_ENABLED` | `true` to enable auth and data access; anything else fails closed |
| `AUTH_SITE_URL` | Exact canonical origin, for example `http://localhost:3000` |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (legacy and service-role JWT keys are rejected) |
| `SUPABASE_SECRET_KEY` | `sb_secret_…`; server-only, used solely for the trusted proposal function |
| `MODEL_API_KEY` | Meta API key |
| `META_RATE_LIMIT_MODE` | `in-memory`: enables Ask with 5 requests per user per minute per process |

In the Supabase project, allow the redirect `<AUTH_SITE_URL>/auth/callback` and
keep email confirmation enabled. Deployment requirements are in
[RELEASE_READINESS.md](docs/meta/RELEASE_READINESS.md), and the demo walkthrough
is in [DEMO_SCRIPT.md](docs/meta/DEMO_SCRIPT.md).

## Known limitations

- No password reset, OAuth, MFA, voice capture, notifications, or file
  capture.
- Retrieval is lexical, not semantic or vector.
- Actions are planning cards. Nothing is executed externally.
- The Meta rate limiter is per process. Multi-instance hosting needs the shared
  limiter described in the release-readiness document.
- Supabase's built-in email service only reaches project team members.
  Real-user sign-up needs custom SMTP.
- Keyboard focus order has an unresolved intermittent finding, and no
  physical-device accessibility testing has been done.

## Provenance and attribution

This edition builds on the original **REIBRY** application (September 2026,
source commit `76d3494465bab43a5051498e90b9a486a65312b9`).

**Inherited from the original, then adapted and hardened here:**

- the UI shell, design tokens and navigation;
- Memory, Capture, lexical retrieval, Life, Today, Home, Plans and the Ready
  Pack taxonomy;
- Supabase session conventions.

**New Meta Hackathon work:**

- the Muse Spark adapter and its grounding and citation gate;
- the trusted proposal ledger and confirmed Action Cards;
- the Stage 11–12 security hardening;
- the migrations and live verification.

[PREEXISTING_WORK.md](PREEXISTING_WORK.md) and
[MIGRATION_LOG.md](docs/meta/MIGRATION_LOG.md) record the stage-by-stage
history. Original REIBRY contributors retain attribution and applicable rights.
No license is granted or inferred by this repository.
