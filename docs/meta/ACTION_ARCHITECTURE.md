# Action proposal and confirmation architecture

Stage 9 turns validated Stage 8 suggestions into user-owned, inert planning records. It does not execute an external action. This is new Meta Hackathon development built on the migrated REIBRY authentication, Memory, retrieval and design foundations.

## Lifecycle

1. `POST /api/ai/ask` verifies the session and retrieves the owner's evidence.
2. Muse Spark suggestions have already passed the Stage 8 structured-output and Memory-ID allowlist checks.
3. The server bounds each title, description and citation list, drops malformed or unsupported suggestions, and calls the database proposal function. The client cannot submit proposal text or ownership.
4. A proposal starts as `proposed`, expires after 24 hours and is only a reviewable planning suggestion.
5. The owner may reject it or explicitly confirm it. Confirmation creates exactly one `confirmed` Action Card and never means `executed` or `completed`.

`expired` is a logical API state for a proposed record whose deadline passed. `rejected` and `confirmed` are terminal. No scheduling, reminder, background job or external tool exists.

## Trusted boundaries

The verified Supabase user supplies `user_id`; callers cannot supply it. The Ask flow supplies proposal content and citations directly from the validated model response. `create_action_proposals` again verifies that every cited Memory belongs to the authenticated user before inserting any proposal.

Direct authenticated table access is read-only. The migration revokes all table privileges and grants only `SELECT`; no direct insert/update/delete RLS policy exists. Three fixed `SECURITY DEFINER` functions are the only mutation surface:

- `create_action_proposals(jsonb, text)` accepts one to three bounded items, only `meta:muse-spark-1.3` provenance, and owner-owned Memory IDs.
- `confirm_action_proposal(uuid)` locks the owned proposal, revalidates its citations and expiry, inserts the Action Card and updates proposal state in one transaction.
- `reject_action_proposal(uuid)` locks and transitions only an owned, current proposal.

Functions use an empty search path, fixed table qualification and safe custom error codes. Cross-owner and missing IDs are indistinguishable.

## Idempotency and evidence

`action_cards.proposal_id` is unique. Confirmation locks the proposal row with `FOR UPDATE`. A retry after success returns the existing Action Card; concurrent requests serialize and cannot create a second card. Any function error rolls back the insert and state update together.

Composite foreign keys bind proposal/Memory links and cards to the same owner. An Action Card preserves the exact validated Memory IDs, model provenance, proposal link and confirmation timestamp. API views remove the owner ID and add only local `/memories#memory-{id}` links.

## API and UI

- `GET /api/actions/proposals` lists the current owner's proposals.
- `POST /api/actions/proposals/{id}/confirm` explicitly confirms one proposal.
- `POST /api/actions/proposals/{id}/reject` rejects one proposal.
- `GET /api/actions` lists confirmed cards.
- `GET /api/actions/{id}` reads one confirmed card.

All responses are private/no-store. Mutation routes require same-origin requests and accept no body, preventing a client from replacing trusted proposal content. `/ask` presents Review, Save and Reject states. `/actions` renders only persisted confirmed cards and their Memory links.

## Verification boundary

Deterministic tests prove application ownership, expiry, rejection, failure rollback and idempotent/concurrent behavior with local repositories. Static checks inspect migration safeguards. `supabase/tests/action_rls.sql` is an isolated two-user plan for a disposable database only. The migration and SQL plan were not executed; hosted PostgreSQL transactionality, grants and RLS remain **NOT VERIFIED**.

Real Meta inference also remains **NOT VERIFIED**. Automated tests use mocked transport and never call Meta or Supabase. No production mock persistence fallback exists.
