# Release Readiness (Stage 12G)

Date: 2026-10-30 (Africa/Lagos). Branch `feat/original-product-parity`, parent
commit `8a601ae`.

Scope: hackathon deployment readiness for REIBRY Meta Edition. The product
design is unchanged. Nothing was pushed or deployed, no hosted schema or Auth
setting changed, no Meta request was made, and no user was created. Project
references, keys, and test credentials are deliberately omitted.

## Verdict: not yet ready for judge submission

The application, database, and security boundaries are verified (Stages 12E–12F). Four owner actions block a public judge demo:

1. **Email delivery.** Custom SMTP is required, or a pre-provisioned demo
   account.
2. **Production Auth URLs.** The Supabase Site URL and redirect allowlist must
   be set for the production domain.
3. **Shared Meta rate limiting.** It is needed for multi-instance hosting, or
   an explicit decision to accept the per-instance limit for a bounded demo.
4. **GitHub publication.** The remote LFS incident is unresolved.

The sections below give the evidence for each.

## 1. Authentication and email verification

### Verified in code and live (local app against the hosted project)

| Check | Result |
| --- | --- |
| `AUTH_SITE_URL` vs. the real local origin | Both `http://localhost:3000` |
| Hosted Auth settings (public endpoint) | Email provider on; **confirmation required** (`mailer_autoconfirm=false`); sign-ups open; anonymous users off |
| Sign-up before verification | No session is issued. `requiresConfirmation = !session`, and the form shows "check your email" and never treats the user as signed in |
| Sign-up input validation | Cross-origin 403; weak password 400 `WEAK_PASSWORD`; invalid email 400 `INVALID_EMAIL` (all rejected before any provider call) |
| Callback with a bogus code, no PKCE verifier cookie | 303 to `/auth?error=INVALID_CALLBACK` |
| Callback with a bogus code and a forged verifier cookie | 303 to `/auth?error=INVALID_CALLBACK`; **no session cookie set** |
| Open redirect via `next` (`//evil.test`, `https://evil.test/x`, `/\evil.test`, encoded `//`) | Always stays on the app origin. A successful callback destination is restricted to an explicit route allowlist (`safeNext`, unit-tested) |
| `/auth` error state | Shows "This confirmation link could not be verified…" |
| Session after callback | `exchangeCodeForSession`, then a mandatory `getUser()` before redirect. This is unit-tested; the live path needs a real email (see below) |
| Expired, revoked, or malformed sessions | 401 with the cookie cleared, or a redirect for pages (Stage 12F-3) |

### Blocked

**Real email delivery: BLOCKED.**

- Supabase's built-in email service only delivers to the project's team
  members ("Email address not authorized" for anyone else).
- It is capped at **2 messages per hour**, has no delivery SLA, and is "not
  meant for production use"
  ([Supabase SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp)).
- Whether this project has custom SMTP could not be read without the
  Management API. No owner-controlled inbox was available, so no confirmation
  email was sent.

**Redirect allowlist and email template: NOT VERIFIED.** Neither is exposed by
public endpoints. The owner must confirm both in the Supabase dashboard
(Authentication → URL Configuration and Email Templates):

- **Site URL:** the production origin.
- **Redirect URLs:** must include `https://<production-domain>/auth/callback`
  (plus `http://localhost:3000/auth/callback` for local use).
- **Confirm-signup template:** keep the default `{{ .ConfirmationURL }}` link.
  With the server-side PKCE flow, this lands on `/auth/callback?code=…` and is
  exchanged by the app. The confirmation must be opened in the **same browser**
  that signed up, because the PKCE verifier cookie lives there.

**Password reset: not implemented** (there is no endpoint or UI). This is a
documented product limitation, not a defect. A user who forgets their password
cannot recover the account in this edition.

### Owner options for the judge demo (choose one)

- **A. Custom SMTP.** Configure a provider such as Resend, Postmark or SES in
  Supabase Auth. Judges can then self-register with real confirmation. This
  needs a verified sender domain. Retest sign-up with an owner-controlled
  inbox.
- **B. Pre-provisioned demo account.** The owner approves creating one
  pre-confirmed demo user through the Auth admin API, the same method used for
  the Stage 12F-2 test users. The credentials go to judges privately. Global
  confirmation stays enabled.

## 2. Deployment configuration

| Area | Status |
| --- | --- |
| Runtime | Next.js 16.3.5, Node.js `>=22.18.0` (validated on 24.20.0); no `next.config`; default Node.js runtime |
| Supabase SSR | `@supabase/ssr` 0.12.7. Cookies are `HttpOnly`, `SameSite=Lax`, host-scoped, and `Secure` on HTTPS; the browser never receives tokens |
| Variables read by the app | Exactly seven (below); **no `NEXT_PUBLIC_*` variables** |
| Meta key | Read only in `src/lib/ai/meta/client.ts` (`server-only`) |
| Supabase secret key | Read only in `src/lib/supabase/trusted-server.ts` (`server-only`); used solely for the trusted proposal RPC after session and Muse validation |
| Client bundles | 0 key matches in static or server output (key present only in ignored `.next/cache`) |
| Same-origin protection | Every mutation requires `Origin` equal to `AUTH_SITE_URL` and rejects `Sec-Fetch-Site: cross-site`; no CORS headers are emitted |
| Timeouts | Auth/data routes 8 s; Ask/Home 25 s overall (Meta at most 2 attempts × 12 s with bounded backoff on 429/500/503); client session check 12 s |
| Model errors | Mapped to fixed codes (`AI_RATE_LIMITED` 429, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE`, …); no provider body is returned |
| Logging | No `console.*` calls in `src`; raw prompts and provider bodies are never logged |
| Build caches | `.next/` (including `.next/cache`, which holds the key) is git-ignored and in Vercel's default CLI exclusions |
| CLI upload safety | **Added `.vercelignore`.** Vercel's defaults do not exclude `.auth/` (test manifest with passwords), `test-results/` (session screenshots), `supabase/.temp/`, or the private incident report |

### Vercel environment variables

Mark the secrets as **Sensitive**, for Production only:

| Name | Value |
| --- | --- |
| `AUTH_ENABLED` | `true` |
| `AUTH_SITE_URL` | `https://<production-domain>` (origin only, no path or trailing slash) |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` (Sensitive; server-only) |
| `MODEL_API_KEY` | Meta API key (Sensitive) |
| `META_RATE_LIMIT_MODE` | `in-memory`, the only accepted value today. Without it, Ask/Home fail closed with `AI_NOT_CONFIGURED` |

### Deployment caveats

- **Single canonical origin.** All mutations require
  `Origin == AUTH_SITE_URL`. Preview deployments on other `*.vercel.app` hosts
  therefore reject writes with 403. Demo only on the production domain, and
  disable or protect previews.
- **Deploy from Git or a fresh Vercel build.** Never deploy a local
  `.next`/`--prebuilt` output from this machine, because its compiler cache
  contained a key.
- **Function duration.** Ask/Home can take up to about 25 s. Confirm the
  Vercel project's maximum function duration is at least 30 s; with Fluid
  compute it is well above this.
- **Committed `.env.example`.** It lists six names and lacks
  `SUPABASE_SECRET_KEY`. A local, uncommitted owner edit to that file was
  preserved and not staged. Use the table above as the authoritative list.

## 3. Distributed Meta rate limiting

### Current behavior

`createInMemoryAskRateLimiter` allows 5 Meta requests per user per 60 s,
**per process**. Ask and Home share one limiter. Meta is disabled unless
`META_RATE_LIMIT_MODE=in-memory`.

On Vercel, concurrent instances each hold their own counter. The effective
limit is therefore 5 × (number of warm instances) per user per minute. Spend is
still bounded by:

- the 800-output-token cap;
- 2 attempts per request;
- the Stage 12D measured cost of about $0.0015 per request.

The limit is not exact.

### Recommended smallest safe design (not implemented; needs approval)

The design uses a Postgres-backed atomic counter in the **existing** Supabase
project, so it adds no new vendor or credentials.

**Database (new migration):**

- Table `meta_request_quota(user_id uuid references auth.users on delete cascade, window_start timestamptz, count int, primary key (user_id, window_start))`, with RLS forced and no direct grants.
- Function `consume_meta_quota(p_limit int, p_window_seconds int) returns boolean`:
  - `security definer`, with a pinned `search_path`;
  - uses `auth.uid()`;
  - performs a single `INSERT … ON CONFLICT (user_id, window_start) DO UPDATE SET count = count + 1 WHERE count < p_limit RETURNING true`.
- EXECUTE is granted to `authenticated` only and revoked from `anon` and `PUBLIC`.
- Over-limit returns `false`. Errors must use non-retryable SQLSTATEs (for
  example `PT429` or `PT503`), **never `40001`** (see
  [POSTGREST_CONFLICT_FIX.md](POSTGREST_CONFLICT_FIX.md)).

**Application:**

- Make `AskRateLimiter.consume` async.
- Add `META_RATE_LIMIT_MODE=shared`, which calls the RPC with the user's own
  session client, so no service role is involved.
- Keep `in-memory` for local single-instance use.
- An unset or unknown mode keeps Meta **disabled**.
- An RPC failure fails closed (`AI_UNAVAILABLE`); there is no silent fallback.

**Verification:**

- Exact concurrency test through PostgREST 14.18: N parallel calls with limit L
  yield exactly L successes.
- Cross-user independence.
- The anonymous call is denied.

**Cost:** $0 incremental on the existing Supabase plan, at about one small
write per Ask request.

**Alternative.** Upstash Redis through the Vercel Marketplace (atomic
`INCR` + `EXPIRE`). This adds a vendor, two Sensitive variables, and usage-based
pricing. Use it only if the owner prefers a non-database store.

## 4. Browser and mobile QA

Run with headless Chrome over the DevTools protocol and a fresh real session for
synthetic User A. Ten pages were checked at 390×844, 430×932, and 1440×1000:

- Home
- Capture
- Memories
- Life
- Today
- Plans
- Plan detail with Ready Pack
- Ask (render only, never submitted)
- Actions
- Settings

**Results:**

- All 30 page loads rendered authenticated, with the correct heading.
- 0 horizontal overflow.
- 0 off-screen elements.
- 0 unnamed buttons or links.
- No User B data.
- Only console error: a missing `/favicon.ico` on the first load.

Screenshots are in the ignored `test-results/stage12g/` and are not for
publication.

**Target size.** A generic 24 px scan flagged 1–4 controls on some pages. A
direct re-check of Memories and Plan detail at 390 px found none. This is
treated as inconclusive, so verify visually before submission.

### Keyboard focus: unresolved and not mobile-specific

This corrects Stage 12F-2. In repeated trials, Tab from the header sometimes
skipped all `<main>` content and went straight to the bottom navigation:

- on Memories and Plan detail;
- at **both** 390 px and 1440 px;
- regardless of mobile or touch emulation, `main`'s `tabindex`, or scroll
  state.

Clicking into the page first did not make it deterministic. The "Skip to
content" link reached `<main>` content in 10 of 12 trials. The cause has not
been isolated: it may be an app focus or hydration timing issue, or a headless
Chrome focus quirk.

**Required before submission:** a manual keyboard pass in a real desktop
browser, and a real phone with an external keyboard or switch access.
**Physical-device QA was not performed.**

### Original-product comparison

This edition was matched to the **original shipped source** at `76d3494`
(Stage 10, [VISUAL_PARITY_RESULTS.md](VISUAL_PARITY_RESULTS.md)). Two
original design-reference prototype screens were viewed locally and read-only;
they were not copied. They show concepts the shipped original and this edition
do not include:

- Today/Ask/Life bottom-navigation labels;
- a notification bell;
- semantic-match percentages with thumbnails;
- voice input;
- temporal clarification cards;
- category filter chips.

These are expected prototype differences, not regressions.

## 5. Publication readiness

| Item | Status |
| --- | --- |
| Branch layout | `main` = `eb0bd84` (Stage 9) is an ancestor of `feat/original-product-parity` (`8a601ae` + this stage), so integration is a fast-forward |
| Remote state (local record only, no fetch) | Reflog shows a push of 4 commits to `origin/main` (up to `644e0b1`) on 2026-10-27 21:56; the current remote state is not re-verified |
| Full-history scan (4 refs, 424 blobs) | **Clean**: no real key values, project reference, test credentials or IDs, JWTs, `sb_` keys, private keys, GitHub tokens, LFS pointers, or binary blobs; no private or binary-type paths ever committed |
| LFS in this repo | No `.gitattributes`, `.lfsconfig`, hooks, or LFS objects. **Global LFS filters remain installed on this machine** |
| Remote LFS incident | **UNRESOLVED.** 24 objects (about 3.5 MB of design references and documents) were uploaded by an earlier dry-run from the original repo; no cleanup confirmation exists |
| Attribution | `PREEXISTING_WORK.md` and the README credit the original REIBRY (`76d3494`); inherited vs. new Meta work is separated |
| License | **None in the repository.** The original's license is unverified. This is an owner decision |
| Commit identity | All 24 commits up to `8a601ae` carry the owner's personal email, which becomes public on push. Four commits also carry an AI co-author trailer |

### Integration plan (owner-executed, after the blockers clear)

1. Resolve the LFS incident with GitHub Support (see the private Stage 1
   report) and get written confirmation.
2. Run `git fetch origin` (read-only) and confirm that `origin/main` is still
   `644e0b1` or another ancestor of local `main`. Stop if it diverged.
3. Run `git switch main && git merge --ff-only feat/original-product-parity`.
4. Re-run lint, typecheck, tests, build, and the history scan on `main`.
5. Push with `GIT_LFS_SKIP_PUSH=1` (the Stage 1 procedure, updated for the new
   head), with hooks reviewed and not bypassed. Verify that
   `git ls-remote origin refs/heads/main` equals the local head.

### GitHub publication safety checklist

- [ ] LFS incident confirmed resolved in writing.
- [ ] Decide whether the tracked `PREEXISTING_WORK.md` incident paragraph may
      be public.
- [ ] License decision recorded; original contributors' permission confirmed.
- [ ] Commit email acceptable to publish (or rewrite policy decided before the
      first public push).
- [ ] `docs/meta/STAGE1_RECOVERY_REPORT.md` stays untracked.
- [ ] `.auth/` and `test-results/` stay untracked.
- [ ] History scan re-run on the exact commit to be pushed.
- [ ] Repository visibility chosen deliberately.
- [ ] No Vercel deployment until production Auth URLs and email are set.

## 6. Remaining release blockers (judge submission)

1. **Email:** configure custom SMTP and retest real sign-up, or approve one
   pre-confirmed demo account.
2. **Supabase Auth URL configuration:** production Site URL plus
   `/auth/callback` redirect; confirm-signup template uses
   `{{ .ConfirmationURL }}`.
3. **Rate limiting:** approve the shared Postgres limiter, or explicitly
   accept the per-instance `in-memory` limit for a bounded demo.
4. **Keyboard:** manual keyboard pass on a real desktop browser and a phone;
   fix if the Tab skip reproduces.
5. **Publication:** resolve the LFS incident and work through the checklist
   above; then the fast-forward integration and the first authorized push.
6. **Deployment:** create the Vercel project from Git with the seven variables;
   restrict previews; confirm function duration.
7. **Data:** the two synthetic users and records remain in the development
   project. Cleanup needs approval (`.auth/stage12f2/cleanup.mts`), and the
   synthetic proposals carry forced Muse provenance metadata.
8. **Product limitations to disclose:**
   - no password reset;
   - lexical (not semantic) retrieval;
   - no voice capture or notifications;
   - no external action execution.
