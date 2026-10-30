# Ready Pack verification plan

The Stage 11E automated suite uses synthetic repositories and static SQL inspection only. The migration has not been applied to any database.

## Approved disposable-database procedure

1. Create a disposable Supabase project that is unrelated to original or production REIBRY.
2. Apply the Meta Edition migrations in filename order through `20261030020000_ready_packs.sql`.
3. Create isolated users A and B; create owned Plans and Plan-attached Memories for each.
4. Run `supabase/tests/ready_packs_rls.sql`, then exercise the functions with each authenticated JWT.
5. Verify anonymous reads/functions fail; A cannot list/read B's packs; A cannot confirm using B's Plan or Memory; a Memory not attached to A's Plan is rejected.
6. Verify a stable request UUID returns one pack, concurrent duplicate confirmation produces one active pack, stale versions roll back, and checklist retries do not overwrite a newer version.
7. Verify direct insert/update/delete against all three tables is denied while owner select is allowed.
8. In an authenticated isolated browser, create a Plan, attach synthetic Memories, select sections, confirm, refresh, edit choices and persist a reviewed checkbox.
9. Capture 390×844, 430×932 and 1440×1000 comparisons against the original UI using synthetic data only.

## Expected proof

- Exact pack and Memory IDs belong to one owner.
- A failed confirmation leaves no pack/items/partial checklist.
- Empty sections remain present and truthful after refresh.
- Metadata-only links remain labeled as limited evidence.
- No provider request, Action Card, reminder, external operation or production mock fallback occurs.

Until this procedure passes, hosted persistence, RLS, transactionality, authenticated visual parity and end-to-end refresh behavior are **NOT VERIFIED**.
