# Controlled Meta live verification

Live synthetic Meta inference is **VERIFIED** as of Stage 12D. The corrected
adapter received one HTTP 200 response from Standard `muse-spark-1.3`; strict
structured-output, runtime grounding, and exact synthetic Memory citation
validation all passed. No raw prompt, answer, response body, or secret was
printed or retained in documentation.

## Owner approval gate

`npm run verify:meta` exits before network access unless both conditions are true:

1. the owner explicitly authorizes the billable smoke test at execution time; and
2. the process environment contains `META_LIVE_VERIFY=I_AUTHORIZE_BILLABLE_META_TEST` and `MODEL_API_KEY`.

Supply the key through an approved ephemeral secret mechanism, never source control, a command-line URL, screenshot, chat message or shell-history entry. The script does not load Supabase, application sessions, databases or personal Memories.

## Fixed synthetic request

The verifier asks one fixed question about one hardcoded synthetic launch-checklist Memory. It uses Standard `muse-spark-1.3`, `store=false`, no tools, strict schema, `reasoning.effort=minimal`, and an 800-token output ceiling. Its injected adapter sets `maxAttempts=1`; transient errors cannot retry. The complete serialized request is 2,062 bytes.

At Standard rates verified on 2026-10-30, the pessimistic one-request estimate is about $0.0041 and below $0.01. Actual output prints only pass/fail, model, latency, request count, aggregate input/output/total tokens, estimated USD cost and validation category. It never prints the key, prompt, evidence or answer.

## Stage 12D result

- Requests: 1; no retry.
- HTTP status: 200.
- Model: `muse-spark-1.3` Standard.
- Structured answer: PASS.
- Citation validation: PASS against the single synthetic Memory ID.
- Usage: 397 input, 247 output, 644 total tokens.
- Estimated cost: $0.001546.
- Latency: 2,870 ms.

## Interpreting failures

- `META_NOT_CONFIGURED`: key missing/malformed or execution gate not configured.
- `META_AUTH`: key rejected or revoked.
- `META_BILLING`: credits or billing require attention.
- `META_ACCESS`: model/account access or model identifier rejected.
- `META_RATE_LIMIT`: team limit reached; the verifier does not retry.
- `META_TIMEOUT` / `META_UNAVAILABLE`: transport or provider availability failure.
- `META_INVALID_RESPONSE`: response status, token usage, structured JSON or citation validation failed.

Only a `status=PASS ... validation=PASS` line proves the synthetic inference
worked. Stage 12D produced that line once. This verifies the bounded synthetic
adapter path, not quality on personal Memories or authenticated persistence.
See `LIVE_INTEGRATION_RESULTS.md` for the sanitized integration boundary.
