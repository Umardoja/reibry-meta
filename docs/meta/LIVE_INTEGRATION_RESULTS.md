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
| Data API available | INCONCLUSIVE | OpenAPI returned HTTP 401 with the publishable key. |
| Required schema ready | NOT VERIFIED | Read-only `memories` HEAD returned HTTP 404; no schema paths could be inspected. |
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
response still failed local structured/grounding validation as
`META_INVALID_RESPONSE`. No retry occurred. No further request was made.

- Requests attempted: 2 total.
- Provider transport/model access: reached HTTP 200 on the final request.
- Structured output validated: NO.
- Real grounded Muse inference: **NOT VERIFIED**.
- Input/output token counts: unavailable because rejected responses were not
  accepted or logged.
- Actual cost: unavailable; bounded by the authorized verifier design to less
  than $0.01 combined.
- Raw responses: deliberately discarded and never printed.

Stage 12C needs separate authorization if diagnostic response-shape telemetry
or another billable request is desired. It must retain synthetic evidence and a
new explicit request/cost ceiling.

## Final local regression

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 187/187 (the prior 183 plus four provenance tests).
- `npm run build`: PASS with the complete restored route manifest.
- `git diff --check`: PASS.
- Generated client-static bundle scan: 25 files, zero exact `MODEL_API_KEY`
  matches, zero server environment-name matches, and zero `sb_secret_` shapes.
- The first full `.next` scan found the exact Meta key only in eight ignored
  Turbopack cache files. The exact `.next/cache/turbopack` directory was removed;
  a post-clean scan of 639 remaining build files found zero exact-key matches.
  Client and deployable server output contained no exact key.

Ordinary tests and the build made no Meta request and performed no hosted
Supabase mutation.
