# Hosted Auth and Persistence Results (Stage 12F-2)

Date: 2026-10-30 (Africa/Lagos). Parent commit `ee731c4` on
`feat/original-product-parity`.

Target: the owner-confirmed, disposable REIBRY Meta development project, with
eight migrations applied. No project reference, user ID, email, password,
cookie, or token is recorded in this document. They exist only in the ignored
local manifest `.auth/stage12f2/`.

## Verdict

**PARTIAL.** Hosted Auth, two-user isolation, persistence, and the trusted
proposal boundary all hold under real sessions. No cross-user read, write,
reference, or confirmation succeeded anywhere. One correctness defect blocks
release: every **stale-version conflict hangs in PostgREST** instead of
returning 409. Two smaller error-mapping defects also return the wrong status
code. The details are in [Defects found](#defects-found).

The live harness ran 177 checks: 169 passed and 8 failed. All 8 failures were
refusals with a wrong status or a timeout. None exposed or changed data.

## What was exercised

- **Auth users:** two synthetic Auth users, labelled `Synthetic Test User A/B`.
  They were created through the Auth admin API with only these two accounts
  marked email-confirmed. The secret key was used for those two calls and
  nothing else. Global Auth settings were not changed: email provider on,
  confirmation required, sign-ups open, anonymous users off.
- **App under test:** the production build (`next start`) on the canonical
  loopback origin. All app traffic went through its real HTTP API with the
  app's own `reibry-meta-auth` session cookies, obtained from
  `POST /api/auth/sign-in`.
- **Direct Data API checks:** the hosted Data API was called with each user's
  real Supabase session and the publishable key, plus an anonymous client. No
  service-role query was treated as an RLS result.
- **Synthetic proposals:** created only through the application's own
  trusted-server code path. Muse was not called.
- **Browser QA:** headless Chrome driven over the DevTools protocol, using
  User A's real session cookie.

## Auth sessions

| Check | Result |
| --- | --- |
| Email/password sign-in for A and B | PASS |
| Wrong password | 401 `INVALID_CREDENTIALS` |
| Sign-in with no `Origin` header, or a foreign one | 403; no cookie set |
| Session cookie attributes | Host-scoped; `HttpOnly`; `SameSite=Lax` |
| `/api/auth/me` (via `getUser()`) | Returns the signed-in user's own ID for each user |
| 7 protected pages, anonymous | 307 redirect to `/auth?next=…` |
| 8 product APIs, anonymous | 401 |
| Garbage cookie | 401; cookie cleared |
| JWT payload re-signed with B's `sub` | 401 |
| Expired access token, valid refresh token | Transparent refresh; 200; new cookie |
| Expired access token, revoked refresh token | 401 (pages redirect) |
| Unexpired access token of a signed-out session | 401 |
| Sign-out | 200; cookies cleared; the old session is rejected; the user's other sessions are unaffected (`scope: local`) |
| Caller-supplied `userId` on Memory or Plan create | 400 (exact-key contracts) |
| Normal repositories | Use the publishable key and the user's session only |

**Callback allowlist and email delivery.** These were not verified. The
redirect allowlist is not readable through a public endpoint, and the test
users did not need email confirmation. Sign-up through a real inbox and the
`/auth/callback` round-trip remain untested.

## Persistence

Each item below was written through the API and then read back. Items marked
as re-read in a new session were checked from a freshly signed-in session.

- **Memories:**
  - create, read, update, and delete;
  - a deleted Memory reads back as 404;
  - each user's list contains exactly that user's records.
- **Capture:**
  - an identical note is deduplicated (200, `duplicate: true`, same ID);
  - the same text captured by the other user becomes their own new Memory,
    because deduplication is owner-scoped.
- **Lexical retrieval:**
  - `q=lagos` returns only the caller's Memories;
  - a term that exists only in A's data returns 0 results for B.
- **Life:**
  - deterministic dated creation;
  - duplicate text is deduplicated;
  - update, delete, and 404 after delete.
- **Today:**
  - each user sees only their own upcoming Life context;
  - resurfaced evidence is drawn only from that user's Memories (A: 3, B: 2).
- **Plans:**
  - creation with the user's own Life context and three Memories;
  - a repeated `requestId` returns the same Plan;
  - updating at the current version increments it;
  - the detail view includes the Life and Memory references;
  - delete, and 404 after delete;
  - Plan v2 is still present in a new session.
- **Ready Packs:**
  - candidates are drawn only from Memories linked to the Plan;
  - confirmation uses explicit selections;
  - a repeated `requestId` returns the same pack;
  - a checklist update at the current version persists, including in a new
    session.

## Trusted proposals and Action Cards

**What was created.** Two synthetic proposals were created for User A only.
They went through the application's own `createSupabaseActionRepository`
trusted path, using the server-only client. Each title begins
`[SYNTHETIC TEST — not Muse output]`, and each description says it was not
generated by Meta Muse.

**Limitation: the provenance label.** The trusted RPC accepts only
`p_model_provenance = 'meta:muse-spark-1.3'`, and it stamps
`trust_source = 'server-validated-meta'`. These synthetic rows therefore carry
a Muse provenance label in the database even though Muse was not involved.
They must not be counted as Muse output, and they are recorded for cleanup. A
future synthetic-test provenance value would need its own reviewed migration.

**Results:**

- **Idempotency:** replaying the same trusted request returned the same two
  proposals.
- **Cross-user Memory:** a trusted request that cited B's Memory for A was
  refused (`INVALID_STATE`).
- **Direct RPC calls:** the authenticated A client and the anonymous client
  both got `42501` when calling `create_trusted_action_proposals` directly.
- **Other user's proposals:** B could not list, confirm, or reject A's
  proposals (404).
- **Double confirmation:** two concurrent confirmations of one proposal
  produced exactly one Action Card.
- **Confirmation retry:** returned the same card.
- **Rejection:** rejecting the second proposal worked. Confirming it afterwards
  returned 409 `INVALID_STATE`.
- **Action Cards:** the card was listed and readable by A, including in a new
  session. B received 404 on read, and the card is absent from B's list.

## Cross-user security

**Through the app API, in both directions,** each user was denied every action
on the other user's records:

- read, update, or delete the other's Memory;
- read or update the other's Life context;
- read, update, or delete the other's Plan;
- read the other's Ready Pack or update its checklist.

These attempts returned 404. Referencing the other user's Memory or Life
context in a Plan returned 400 `INVALID_REFERENCE`. Building one's own Ready
Pack with the other user's Memory also returned 400 `INVALID_REFERENCE`. After
all attempts, the targeted records were unchanged.

**Through the hosted Data API with real user sessions:**

- **Own rows only:** selects on all 11 product tables returned only the
  caller's rows. Filtering on the other user's ID returned nothing.
- **Forged owner:** an insert with the other user's `user_id` got `42501`.
- **Update and delete:** both affected 0 rows on the other user's Memory.
- **Owner RPC:** `create_owned_plan` citing the other user's Memory got
  `23503`.
- **Direct Plan insert:** refused (`42501`), as Plan writes are RPC-only.

**Anonymous Data API:** selects on six product tables and the Plan RPC all got
`42501`.

## Concurrency and state

| Check | Result |
| --- | --- |
| 3 concurrent Plan creates with one `requestId` | One Plan (201, 200, 200) |
| 2 concurrent Ready Pack confirms with one `requestId` | One pack (201, 200) |
| Concurrent proposal double-confirm | One Action Card |
| Plan update that includes one foreign Memory | 400; title, version, and Memory links unchanged |
| Ready Pack confirm with a foreign selection | 400; pack count unchanged |
| Stale Plan version | **Hangs, then 504 `AUTH_TIMEOUT`** (expected 409) |
| Stale checklist version | **Hangs, then 504 `AUTH_TIMEOUT`** (expected 409) |
| 2 concurrent checklist updates at the same version | One 200; the loser **hangs, then 504** (expected 409) |

## Defects found

### 1. Stale-version conflicts hang in PostgREST

Severity: **release blocker**.

`update_owned_plan` signals version conflicts with SQLSTATE `40001`
(`serialization_failure`). So do `confirm_owned_ready_pack` and
`update_owned_ready_pack_checklist`, at three sites. PostgREST treats `40001`
as a retryable transaction failure and re-runs the transaction, which
deterministically raises `40001` again.

**Evidence:**

- A direct, raw PostgREST call with a stale version (no client library) did
  not answer within 30 s.
- The app's 8 s bound turns this into a misleading 504 `AUTH_TIMEOUT`.
- A read-only `pg_stat_database` sample showed 362,373 rolled-back against
  27,834 committed transactions, which is abnormal for a fresh project and
  consistent with rapid retries during the hangs.
- No such query was still running at sampling time. Further samples were
  refused by a transient CLI login-role `403`, so the counter was not
  re-checked.

**Impact:**

- Users get an 8 s hang and the wrong error instead of "changed elsewhere".
- Any authenticated user can tie up a PostgREST connection by sending a stale
  version.

**Why the local harness missed it.** The Stage 12A and 12F-1 SQL harness calls
these functions directly, not through PostgREST.

**Fix (needs separate approval).** A forward migration that raises a
PostgREST-native status code (for example `PT409`) in all four places, plus
repository mapping for that code. Verify it through PostgREST, not SQL alone.

### 2. Ready Pack routes return 503 for another user's Plan

Severity: low.

`GET /api/ready-packs/candidates?planId=<other user's plan>` and
`POST /api/ready-packs` both return 503 `STORAGE_UNAVAILABLE` instead of 404.
The plan lookup correctly finds nothing. However, the Ready Pack handler does
not map `PlanRepositoryFailure`, so `NOT_FOUND` becomes a generic storage
failure. This does not leak data. It is an application-only fix.

### 3. Malformed refresh token returns 503 instead of 401

Severity: low.

A session cookie with an expired access token and a syntactically invalid
refresh token gets 503 instead of 401. Real expiry and revocation behave
correctly. The request still fails closed, but the cookie is not cleared.

## Browser QA

**Setup.** Headless Chrome (DevTools protocol) with User A's real session, at
390×844, 430×932, and 1440×1000. The 34 screenshots are saved in the ignored
`test-results/stage12f2/`.

**Pages covered:**

- Home
- Capture
- Memories
- Life
- Life manage
- Today
- Plans
- Plan detail with Ready Pack
- Actions
- Ask
- a missing Plan

Home and Ask were rendered but never submitted, so no Muse request occurred.

**Results:**

- **Rendering:** every page rendered authenticated, with no redirect to
  `/auth`.
- **Layout:** no horizontal overflow and no off-screen elements at any
  viewport.
- **Navigation:** the navigation bar was present on every page.
- **Isolation:** no User B content appeared anywhere.
- **Not-found state:** the missing Plan shows "Plan not found or unavailable."
  inside the normal layout.
- **Loading state:** under throttling, "Checking your session… This check is
  limited to 12 seconds." appears.
- **Console:** one console error on the first 390px Home load (not repeated at
  other viewports) and one on the missing-Plan page (its 404 resource).

**Keyboard:**

- At 1440px, Tab moves through "Skip to content", the account menu, page
  content (links, checklist inputs, "Edit choices"), and then navigation.
  Every stop shows a focus ring.
- At 390px under Chrome's `mobile: true` emulation, Tab skipped the main
  content. The same page at 390px without mobile emulation reached the
  content. The content controls are focusable (`tabIndex` 0, not inert, and
  programmatic focus works).
- This looks like an emulation artifact, not an app defect. It needs a
  real-device or real-keyboard check.

**Not claimed:** visual parity with original REIBRY. The screenshots show the
Meta Edition UI only; no side-by-side comparison was made.

## Cleanup status

Cleanup was **not performed**, because deleting these records was not
separately approved. The following synthetic data remains in the development
project:

| Data | Count |
| --- | --- |
| Synthetic Auth users | 2 |
| Memories | 8 |
| Life contexts | 3 |
| Plans | 4 |
| Ready Packs | 2 |
| Action proposals | 2 |
| Action Cards | 1 |

The Memory, Life, and Plan counts include one deleted during testing in each
case. All IDs are tracked in the ignored manifest. Every product table cascades
from `auth.users`, so deleting the two users removes everything above. After
approval, run:

```text
node --experimental-strip-types --no-warnings .auth/stage12f2/cleanup.mts --confirm
```

The script deletes only the two manifest users whose emails match the
synthetic pattern.

## Regressions and secret exposure

- **Checks:** lint PASS; typecheck PASS; 191/191 tests PASS; production build
  PASS; `git diff --check` PASS.
- **Build output** (953 files scanned): `SUPABASE_SECRET_KEY` was in 0 static
  files, 0 server-output files, and 1 ignored Turbopack cache file
  (local-only; known behavior).
- **Repository:** 204 tracked files contain no secret. No credentials,
  cookies, tokens, screenshots, or caches are tracked or staged.

## Remaining release blockers

1. Fix and re-verify the `40001` stale-version hang through PostgREST.
   This needs a migration approval.
2. Map Plan `NOT_FOUND` in the Ready Pack routes, and map a malformed refresh
   token to 401. Both are application-only changes.
3. Verify real sign-up email delivery and the `/auth/callback` redirect
   allowlist.
4. Check keyboard navigation on a real mobile device.
5. Approve cleanup of the synthetic users and records.
6. Production prerequisites carried forward:
   - a shared atomic rate limiter, because `META_RATE_LIMIT_MODE=in-memory`
     is single-instance only;
   - a deliberate provenance policy for any future synthetic-test proposals.
