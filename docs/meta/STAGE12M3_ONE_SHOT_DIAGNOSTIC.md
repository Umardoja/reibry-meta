# Stage 12M-3 — One-shot Supadata identity diagnosis

**Status: PARTIAL — the precise TikTok source-match defect was diagnosed with one authorized metadata request and fixed locally. No metadata was persisted because the one-shot response was deliberately not retained after diagnosis.**

## Guarded live diagnostic

- Approved source: the single previously approved public TikTok identity `tiktok:7696611605374602518`.
- Application state: `SUPADATA_DEV_ENABLED` remained `false` throughout. The normal application details route, Memory attempt marker, four-ID allowlist, and source-verification rules were not bypassed or changed for this call.
- The ignored, local diagnostic script uses one fixed URL, one fixed endpoint, a five-second timeout, manual redirect refusal, `no-store`, no credentials, a bounded response read, and no retry path.
- Before `fetch`, it uses exclusive `wx` marker creation. A local concurrent-creation self-test passed exactly one claimant and retained its marker. The actual identity marker was absent before the call and is now retained permanently, including if a later invocation fails.
- The marker protects this one laptop diagnostic only; it is not a distributed application ledger.

## Sanitized response evidence

| Field | Observed result |
| --- | --- |
| HTTP status | 200 |
| Latency | 3,671 ms |
| Returned platform | `tiktok` |
| Returned post ID | `7696611605374602518` |
| ID-derived identity | `tiktok:7696611605374602518` |
| Returned URL | absent |
| URL-derived identity | unavailable |
| Description / creator / thumbnail | each present; no text or URLs were retained |
| Original validator outcome | `missing-url` / `supadata-mismatched-source` |

The response platform and numeric post ID matched the canonical selected TikTok exactly. The identity fields did not contradict one another; the response omitted one expected identity field. No raw payload, API key, caption, creator text, thumbnail URL, cookie, user record, or Memory content was written to disk, logs, documentation, or the database.

## Safe correction

`src/lib/capture/supadata.ts` now accepts an omitted `url` **only** when all of these are true:

1. the selected link is a canonical TikTok link with a numeric post ID;
2. the returned platform is exactly `tiktok`;
3. the returned provider ID is exactly that saved numeric post ID; and
4. the provider omitted the URL entirely (`undefined`), rather than returning null, malformed, short, cross-platform, or contradictory data.

In that narrow case, REIBRY retains the already validated saved canonical TikTok link as the source identity. Provider fields remain labelled `supadata-unverified`; the change does not treat a description as a creator caption or evidence that the video was watched.

Instagram has not been relaxed: an Instagram response without a URL remains rejected. A wrong TikTok ID, wrong platform, mismatched URL identity, short URL, or null URL remains rejected.

## Timeout correction

The details path previously gave the native provider and optional provider independent budgets, allowing their combined wait to exceed the request bound. Optional enrichment now receives the remaining shared budget and an abort signal. If it times out after a provider request has begun, a `supadata-timeout` attempt is persisted so a re-share cannot make a second charged lookup. Save-first capture remains unchanged.

## Persistence and product verification

The live response ended with the standalone diagnostic process and was intentionally not stored. Consequently, no existing Memory was updated and no follow-up provider call is allowed in this stage. The existing trusted writer could persist a result in the same server process after it has passed the repaired validator, but that would require a separately authorized live application attempt; no write workaround was invented.

The selected TikTok Memory and all three other previously attempted Memories therefore still need a separately authorized integration test. Instagram remains unverified. Existing YouTube behavior and the User A/User B application isolation were not changed or re-tested live in this one-call diagnosis.

## Credit and release limits

- Metadata endpoint requests made: exactly 1.
- Expected Supadata charge: 1 free metadata credit. The dashboard showed 89 remaining before the call and warns that usage reporting may lag; no paid purchase, subscription, recharge, transcript, extraction, Meta call, or retry occurred.
- `SUPADATA_DEV_ENABLED` remains false in the local application configuration. No REIBRY server configuration was changed by the diagnostic script.

## Local verification

- Focused Supadata tests: 17/17 passed.
- Full lint passed with six existing test-file warnings and no errors. The full suite ran 322 tests: 321 passed; its production smoke test could not reach a Next server that reported ready on a local loopback port. This is an environment failure, not a source assertion failure.
- The normal `npm run typecheck` is blocked in this Windows workspace because another local process or lock prevents Next from opening generated `.next/types/routes.d.ts`; direct TypeScript checking without its incremental cache passed. A production build passed, producing all 19 static pages and the route manifest. A later release check must repeat the normal typecheck and full smoke suite after that lock is cleared.
- The reviewed staged diff passed `git diff --check`; the initial unprivileged Git worktree error was a local sandbox write/read restriction, not a repository-configuration change.
- No migration, hosted database write, Git remote operation, deployment, or original REIBRY modification occurred.
