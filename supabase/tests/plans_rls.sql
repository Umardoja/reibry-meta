-- Disposable two-user verification plan. Run only in an approved isolated Supabase project; always rolls back.
begin;
-- Seed auth User A/User B, one Life context and two Memories per owner using an administrator fixture.
-- SET LOCAL request.jwt.claim.sub to User A and assert direct INSERT/UPDATE/DELETE on plans and plan_memories is denied.
-- As User A call create_owned_plan with User A references: succeeds; retry same idempotency key returns the same ID.
-- As User A call create/update with User B Memory or Life IDs: fails without disclosing their contents.
-- As User B SELECT User A's Plan, then update/delete its ID through RPC: no row / not found.
-- Exercise stale expected_version and concurrent updates: exactly one succeeds and the other receives serialization conflict.
-- Force a bad reference during update and verify Plan fields and plan_memories both roll back.
-- Anonymous SELECT and function execution must be denied.
rollback;
