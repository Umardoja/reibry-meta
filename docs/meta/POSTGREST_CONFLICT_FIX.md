# PostgREST Stale-Version Conflict Fix (Stage 12F-3)

Date: 2026-10-30 (Africa/Lagos). Migration
`20261030050000_stale_version_conflict_sqlstate.sql`, applied to the disposable
REIBRY Meta development project. No project reference, user ID, or secret is
recorded here.

## Root cause

Four optimistic-concurrency checks raised SQLSTATE `40001`
(`serialization_failure`) to signal a business conflict. These were
application-level "this record changed elsewhere" outcomes, not real database
serialization failures.

**PostgREST version dependence.** The hosted project runs PostgREST 14.18. In
that version, `40001` is treated as a retryable transaction failure: PostgREST
re-runs the whole transaction. The check fails deterministically, so every
retry raises `40001` again, and the request never completes.

- Locally on PostgREST 16.4, the same `40001` returned HTTP 500 immediately
  with no retry. The retry loop is therefore specific to the hosted version
  line.
- The Stage 12F-2 explanation, "PostgREST re-runs `40001`", holds for the
  hosted 14.18 but is not universal.

**The loop outlives the client.** A request that times out or disconnects
leaves the backend retrying. On a local 14.18 reproduction:

- 1,364 rollbacks occurred in the 5 s before the client aborted;
- about 2,300–4,400 rollbacks occurred in every 10 s for the full 60 s observed
  afterwards;
- the loop never stopped on its own.

**Why earlier tests missed it.** The Stage 12A/12F-1 SQL harness calls the
functions directly, without PostgREST, so it could not observe the retry.

## Affected functions and SQLSTATE changes

| Function | Condition | Before | After |
| --- | --- | --- | --- |
| `update_owned_plan(...)` | expected version ≠ current | `40001` | `PT409` |
| `update_owned_ready_pack_checklist(uuid,text,boolean,integer)` | expected version ≠ current | `40001` | `PT409` |
| `confirm_owned_ready_pack(...)` | re-confirm with a missing or stale expected version | `40001` | `PT409` |
| `confirm_owned_ready_pack(...)` | competing request with a different idempotency key created the active pack | `40001` | `PT409` |

`PTxyz` is PostgREST's convention for a custom SQLSTATE that maps directly to
HTTP status `xyz`. `PT409` is never treated as retryable.

**Not changed:** no SQL in the chain explicitly raised `40001` for a real
concurrency failure. Genuine engine-generated serialization failures are left
alone, and the application still maps any real `40001` to `CONFLICT`.

## Migration design

The migration uses `CREATE OR REPLACE FUNCTION` for the three functions. Their
bodies were generated from the applied migrations `20261030010000` and
`20261030020000`, and a diff confirms that only the four SQLSTATE literals
changed.

**Preserved:**

- signatures, return types, and parameters;
- `auth.uid()` checks;
- same-owner reference checks;
- row locks;
- optimistic version validation;
- idempotency;
- transaction atomicity.

`CREATE OR REPLACE` keeps each function's owner, ACL, `SECURITY DEFINER` flag,
and `search_path`.

**In-transaction guard.** The migration aborts unless each function:

- is still `SECURITY DEFINER`;
- still has a `search_path`;
- no longer contains `40001`;
- is not executable by `anon` or `PUBLIC`;
- is still executable by `authenticated`.

## Application changes

| Area | Change |
| --- | --- |
| Plan and Ready Pack Supabase repositories | Map `PT409` (and genuine `40001`) to `CONFLICT`, which returns HTTP 409 with a fixed message. No SQL text reaches clients. |
| Ready Pack handler | Maps `PlanRepositoryFailure`. Another user's or a nonexistent Plan in preview or confirm returns 404 `NOT_FOUND` instead of 503. Real storage failures still return 503. |
| `missingSession` | Treats GoTrue's HTTP 400 `validation_failed` as a missing session. GoTrue returns this for a malformed stored refresh token, so the result is 401 with the cookie cleared, or a redirect on pages. Network and 5xx Auth failures remain 503. The function is only called after `getUser()`. |

## Local verification (isolated, before hosted deployment)

**Environment:**

- a private Docker network;
- Supabase `postgres:17.11.0.004`, the same PostgreSQL version as hosted;
- Supabase PostgREST, run once as 16.4 and once as 14.18. The 14.18 image was
  pulled to match hosted.

**Harness-only setup:**

- throwaway credentials;
- the GoTrue-equivalent `auth.uid()`, which reads `request.jwt.claims`;
- HS256 JWTs minted for two synthetic users.

**Results on 14.18:**

- **Before the fix:** the stale update hung and was aborted after 5 s, with
  1,364 rollbacks. The loop persisted after the abort.
- **After the fix**, 27/27 checks passed:
  - stale Plan update, stale checklist, and stale re-confirm all returned
    409 `PT409` in 11–124 ms, with no retry rollbacks and no write;
  - a retry with the current version succeeded;
  - two concurrent updates at one version gave exactly one 200 and one 409,
    with the version incremented once;
  - repeating an idempotency key returned the same pack without duplication;
  - cross-user updates failed with `P0002` and cross-user references with
    `23503`;
  - anonymous RPC calls were denied;
  - the ACL / `SECURITY DEFINER` / `search_path` matrix was identical before
    and after.
- **Applying the migration while a loop was running** ended it at once
  (2,254 rollbacks per 5 s, then 0) without terminating any session.

**Deterministic tests added:**

- `PT409` and `40001` map to 409 with no SQL text, and a connection failure
  maps to 503 (Plans);
- `PT409` maps to 409 for the checklist;
- a Plan `NOT_FOUND` maps to 404 and a Plan storage failure to 503, in both
  Ready Pack preview and confirm;
- `validation_failed` is treated as a missing session, while retryable fetch
  errors and 503s are not;
- the migration contains exactly four `PT409` raises, no `40001`, and the
  privilege guard.

## Hosted findings and deployment

**CLI access.** During this stage the CLI account temporarily lost visibility
of the project, and the login-role endpoint returned 403. Nothing hosted was
inspected or written until the owner re-authenticated and the exact reference
matched again.

**Active loops found before deployment** (read-only):

| Signal | Value |
| --- | --- |
| Rollbacks in a 5 s window | 10,402 (about 2,000/s), against 17 commits |
| Rollbacks since stats reset | 7,278,810 |
| `authenticator` backends `idle in transaction (aborted)` | 4 (two on `update_owned_plan`, two on `update_owned_ready_pack_checklist`) |
| Backend age | about 1 hour, matching Stage 12F-2's four stale requests |

Deployment was paused and the evidence reported. The owner then approved
applying the migration as the non-destructive remedy.

**Deployment:**

- `db push --linked --dry-run` listed only `20261030050000`.
- One `db push --linked` applied it, and its guard passed.
- History now has nine versions.

**Immediately after deployment** (read-only):

- 0 rollbacks in a 5 s window;
- no looping backends;
- one idle `authenticator` backend;
- no session terminated.

**Catalog state after deployment:**

- no function raises `'40001'`;
- all three functions raise `PT409`;
- `anon` can execute 0 `public` functions;
- `authenticated` and `service_role` EXECUTE are unchanged;
- `SECURITY DEFINER` and each `search_path` are preserved;
- RLS is forced on 11 tables.

## Live results (existing synthetic users)

| Check | Result |
| --- | --- |
| Hosted PostgREST valid Plan update | 200 |
| Hosted PostgREST stale Plan update | **409 `PT409`, 234 ms**, nothing written |
| Hosted PostgREST stale checklist | **409 `PT409`, 196 ms**, nothing written |
| App stale Plan update | **409 `CONFLICT`, 440 ms** (was 504 `AUTH_TIMEOUT` after 8 s) |
| App stale checklist | **409 `CONFLICT`, 412 ms** |
| App reload then retry with current version | 200 |
| App 409 body | Fixed message, no SQL detail |
| Cross-user / nonexistent Ready Pack preview or confirm, both directions | 404 `NOT_FOUND` (was 503) |
| Malformed refresh token, API | 401 `AUTH_REQUIRED`, cookie cleared (was 503) |
| Malformed refresh token, page | 307 to `/auth` |
| Owner isolation recheck, both directions (API and Data API) | Pass |

The live stale-version tests sent four stale requests in total. The hosted
rollback total rose by exactly 4: one rollback per conflict, and no loop.

**Live checks:**

- 12/12 stale-version checks;
- 25/25 for 404, 401, isolation, and normal writes, run before the migration
  and again after it.

## Synthetic proposal labeling caveat

Two synthetic proposals from Stage 12F-2 remain for User A, one confirmed into
an Action Card and one rejected. Their titles begin
`[SYNTHETIC TEST — not Muse output]`, and their descriptions state that they
were not generated by Meta Muse.

Their database metadata nevertheless reads
`model_provenance = 'meta:muse-spark-1.3'` and
`trust_source = 'server-validated-meta'`. The trusted RPC accepts no other
provenance. **That metadata is not evidence of a Muse call.**

The only production path that creates proposals (`src/lib/ai/handler.ts`) does
so after a real Meta answer, labelled `meta:${answer.model}`. No production
code was changed to label anything else as Muse output.

Supporting a distinct synthetic or test provenance would require a separate,
reviewed schema change. It is a follow-up, not part of this migration. The test
accounts were not deleted.

## Remaining blocked checks

- Real sign-up email delivery and the `/auth/callback` redirect allowlist.
- Keyboard navigation on a real mobile device.
- Cleanup of the two synthetic users, which needs owner approval.
- Any future SQL raising a custom conflict must be verified through the hosted
  PostgREST version (currently 14.18), not through direct SQL alone.
