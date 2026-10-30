# Controlled Meta live verification

Live Meta inference remains **NOT VERIFIED**. Stage 12B received authorization
for two synthetic requests. The first failed `META_INVALID_RESPONSE`; after
aligning the provider schema with the documented strict subset, the second
reached HTTP 200 but still failed local structured/grounding validation. No raw
response was retained, and no further request was made.

## Owner approval gate

`npm run verify:meta` exits before network access unless both conditions are true:

1. the owner explicitly authorizes the billable smoke test at execution time; and
2. the process environment contains `META_LIVE_VERIFY=I_AUTHORIZE_BILLABLE_META_TEST` and `MODEL_API_KEY`.

Supply the key through an approved ephemeral secret mechanism, never source control, a command-line URL, screenshot, chat message or shell-history entry. The script does not load Supabase, application sessions, databases or personal Memories.

## Fixed synthetic request

The verifier asks one fixed question about one hardcoded synthetic launch-checklist Memory. It uses Standard `muse-spark-1.3`, `store=false`, no tools, strict schema and a 384-token output ceiling. The adapter can retry once only for a documented transient `429`, `500` or `503`, so the absolute ceiling is two requests. Input is under 2 KB.

At Standard rates verified on 2026-10-29, the pessimistic two-request estimate is below $0.01. Actual output prints only pass/fail, model, latency, request count, aggregate input/output/total tokens, estimated USD cost and validation category. It never prints the key, prompt, evidence or answer.

## Interpreting failures

- `META_NOT_CONFIGURED`: key missing/malformed or execution gate not configured.
- `META_AUTH`: key rejected or revoked.
- `META_BILLING`: credits or billing require attention.
- `META_ACCESS`: model/account access or model identifier rejected.
- `META_RATE_LIMIT`: team limit reached after the single allowed retry.
- `META_TIMEOUT` / `META_UNAVAILABLE`: transport or provider availability failure.
- `META_INVALID_RESPONSE`: response status, token usage, structured JSON or citation validation failed.

Only a `status=PASS ... validation=PASS` line proves this synthetic inference
worked. Stage 12B did not produce that line. Token counts and actual cost were
unavailable; the two-request combined ceiling remained below $0.01. See
`LIVE_INTEGRATION_RESULTS.md` for the sanitized result.
