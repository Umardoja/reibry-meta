# Action verification plan

Stage 9 is locally implemented and deterministic, but it is not a claim of live cloud persistence.

## Local evidence

- Contract tests reject malformed text, unknown Memory IDs and cross-owner citations.
- Handler tests reject anonymous, expired-session, cross-origin and body-bearing confirmation requests.
- Repository tests cover valid confirmation, rejection, expiry, repeat and concurrent confirmation, exact Memory links and injected storage failure with no partial record.
- Static SQL checks require forced RLS, read-only authenticated table grants, owner checks, row locking, unique proposal/card association and fixed security-definer RPCs.
- Production smoke checks require unauthenticated Action API responses to return `401` and `/actions` to redirect to authentication.

These checks do not substitute for a real PostgreSQL transaction/RLS run.

## Disposable-project verification required

After explicit owner approval, create a new disposable Supabase project with no production data. Apply the Stage 5, Stage 6 and Stage 9 migrations in order, then execute `supabase/tests/action_rls.sql` inside a rollback-capable test environment.

Verify with two disposable users:

1. Each user can read only their proposals/cards.
2. Direct authenticated inserts and status updates fail.
3. User A cannot create a proposal citing User B's Memory.
4. User B cannot discover or confirm User A's proposal.
5. Expired and rejected proposals cannot be confirmed.
6. Two concurrent confirmations return one stable card and leave one confirmed proposal.
7. A forced transaction error leaves neither a partial card nor a confirmed proposal.
8. Refreshing `/actions` returns the same persisted card and exact citations.

Use synthetic Memories only. Do not use the original production project, service-role credentials or personal data.

## Judge-ready end-to-end run

Live verification needs a disposable Supabase project plus separately authorized Meta credentials. Capture a synthetic Memory, ask a supported question, review a genuine suggestion, explicitly save it, refresh `/actions`, and open the cited Memory. Record that the card is saved but not executed. Provider usage and cloud persistence may be described as verified only after the actual responses succeed.

Current status: authenticated cloud persistence **NOT VERIFIED**; real Meta inference **NOT VERIFIED**; external action execution intentionally absent.
