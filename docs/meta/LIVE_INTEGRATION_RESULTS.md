# Live Integration Results

Date: 2026-10-30 (Africa/Lagos).

No credential values, project identifiers, prompts, evidence bodies, provider
responses, or authorization headers were logged or recorded.

## Supabase

| Capability | Result | Evidence |
| --- | --- | --- |
| Connected | VERIFIED | Configured host was valid Supabase HTTPS; Auth settings returned HTTP 200. |
| Auth service reachable | VERIFIED | Read-only settings request succeeded. |
| Application auth configured | NOT READY | `.env.local` lacks `AUTH_ENABLED` and `AUTH_SITE_URL`. |
| Data API available | INCONCLUSIVE | OpenAPI again returned HTTP 401 with the publishable key. |
| Required schema ready | NO | Read-only HEAD probes for Memories, Life, Plans, Ready Packs, proposals, and Action Cards all returned HTTP 404. |
| Hosted RLS | NOT VERIFIED | No authenticated test users or row operations were authorized. |
| Hosted persistence | NOT VERIFIED | Hosted writes were explicitly prohibited. |
| Disposable project identity | NOT ESTABLISHED | URL/credentials do not prove purpose or disposability. |

Configured names present: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`MODEL_API_KEY`. Missing names required by current server paths include
`AUTH_ENABLED`, `AUTH_SITE_URL`, `META_RATE_LIMIT_MODE`, and
`SUPABASE_SECRET_KEY`. `.env.local` is ignored by Git.

No hosted migration, SQL, user creation, auth change, row write, reset, repair,
or deployment occurred. Authenticated application integration is **BLOCKED** by
unconfirmed project disposability, absent schema evidence, missing app auth
settings, no safe test account, and the prohibition on hosted writes.

## Meta Model API

The owner authorized at most two total requests using the existing synthetic
verifier and a combined maximum expected cost of $0.01. Current official docs
confirmed Standard `muse-spark-1.3`, `POST https://api.meta.ai/v1/responses`,
`store=false`, Responses `text.format`, and Standard prices of $1.25/M input
tokens and $4.25/M output tokens.

The first request used synthetic evidence, made one HTTP request, and returned
`META_INVALID_RESPONSE`. It did not retry. Review against current strict-schema
guidance found nonessential constraint keywords; these were removed from the
provider schema while equivalent and stricter length/count/uniqueness checks
remain in application runtime validation.

The second and final request reached HTTP 200 with `muse-spark-1.3`, but the
response still failed local validation as `META_INVALID_RESPONSE`. No retry
occurred. Because the raw body was deliberately discarded, the historical
failure cannot now be assigned to extraction, truncation, JSON, schema,
citation, or grounding with certainty.

Stage 12C found and fixed a documented extractor defect: an output message's
status is optional and message content may contain multiple output-text blocks,
while the old parser required `status=completed` and exactly one block. It also
added explicit refusal/incomplete and downstream validation categories. These
changes are fixture-verified only; **no Stage 12C Meta request was made**.

- Requests attempted: 2 total.
- Provider transport/model access: reached HTTP 200 on the final request.
- Structured output validated: NO.
- Real grounded Muse inference: **NOT VERIFIED**.
- Input/output token counts: unavailable because rejected responses were not
  accepted or logged.
- Actual cost: unavailable; bounded by the authorized verifier design to less
  than $0.01 combined.
- Raw responses: deliberately discarded and never printed.

A future live retest needs separate authorization. It must retain synthetic
evidence and a new explicit total request/cost ceiling.

### Stage 12D controlled retest

The owner separately authorized one synthetic request with no retry and a
$0.01 maximum estimate. Before execution, the verifier was changed to enforce
`maxAttempts=1`, a one-call fetch guard, Standard `muse-spark-1.3`,
`store=false`, no tools, strict Responses `text.format`, minimal reasoning, and
an 800-token ceiling. The serialized request was 2,062 bytes and the worst-case
estimate was approximately $0.0041.

- Attempted: YES, exactly one request.
- HTTP status: 200.
- Structured output: PASS.
- Exact synthetic citation and grounding validation: PASS.
- Usage: 397 input, 247 output, 644 total tokens.
- Estimated cost: $0.001546.
- Latency: 2,870 ms.
- Retry: none.

Real synthetic grounded Muse inference is now **VERIFIED**. No real Memory,
Supabase record, private prompt, raw response, or secret was transmitted or
logged. Personal-data quality remains outside this verification.

## Stage 12D Supabase staging preflight

The configured endpoint remains reachable and Auth settings returned HTTP 200.
Data OpenAPI returned 401, while read-only HEAD probes for Memories, Life,
Plans, Ready Packs, proposals, and Action Cards returned 404. Application schema
readiness is therefore NO; hosted RLS and persistence remain NOT VERIFIED.

`AUTH_ENABLED=true`, the canonical Auth site configuration, and
`META_RATE_LIMIT_MODE=in-memory` passed the application's exact parsers.
`SUPABASE_SECRET_KEY` remains absent, so trusted proposal persistence is not
configured. No live app journey ran because the schema is absent.

Project identity/disposability was not affirmatively confirmed by the owner.
No local project-link marker exists and the Supabase CLI is not installed.
Accordingly, no link, remote migration-history read, or `db push --dry-run` was
attempted. All seven local migrations were inventoried in order, with no hosted
write.

Stage 12D final validation: lint PASS; typecheck PASS; production build PASS;
191/191 deterministic tests PASS; `git diff --check` PASS. The first full test
run exposed that the smoke server inherited the owner's configured
`AUTH_SITE_URL`, producing an expected origin denial. The harness now binds its
explicit test origin to its reserved loopback port; application origin checks
were not weakened.

The post-build exact-value scan covered 658 `.next` files. The Meta key appeared
only in two ignored Turbopack cache files, with zero client-static and zero
deployable-output matches. No secret value was printed, staged, or committed.

## Final local regression

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- Stage 12C pre-documentation regression: PASS, 190/190 (187 prior plus three
  response-envelope/diagnostic tests). Final validation is recorded in the
  Stage 12C migration-log entry.
- `npm run build`: PASS with the complete restored route manifest.
- `git diff --check`: PASS.
- Generated client-static bundle scan: 25 files, zero exact `MODEL_API_KEY`
  matches, zero server environment-name matches, and zero `sb_secret_` shapes.
- The first full `.next` scan found the exact Meta key only in eight ignored
  Turbopack cache files. The exact `.next/cache/turbopack` directory was removed;
  a post-clean scan of 639 remaining build files found zero exact-key matches.
  Client and deployable server output contained no exact key.

Stage 12C reproduced the cache behavior after a successful production build:
one of 652 scanned files, under ignored `.next/cache/turbopack`, contained the
exact `MODEL_API_KEY`; client-static and deployable output each had zero exact
matches. This is consistent with Turbopack retaining a server compilation input
after Next loaded `.env.local`, not with a shipped client bundle. The cache was
not committed or uploaded. Rotate the key if this workspace/cache has been
shared, synchronized, backed up to an untrusted location, or otherwise exposed;
local presence on the controlled machine alone does not prove external leakage.

Stage 12C final validation: lint PASS; typecheck PASS; 190/190 deterministic
tests PASS; production build PASS; `git diff --check` PASS. Standard validation
made no Meta request and no hosted Supabase mutation.

Ordinary tests and the build made no Meta request and performed no hosted
Supabase mutation.
