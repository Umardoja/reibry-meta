# Stage 11D Plans parity results

## Result

The original REIBRY Plans list and detail compositions are restored over a new owner-bound Plan persistence boundary. Plans remain distinct from Stage 9 Action Cards. Ready Pack generation and persistence are intentionally excluded for Stage 11E. No hosted database, model, remote Git service or private data was contacted.

## Original dependency map

| Original source | Meta Edition target | Treatment |
| --- | --- | --- |
| `src/app/plans/page.tsx` | `src/components/plans/plans-workspace.tsx` | Restored From saved to done, Coming up / No date / Past-completed sections, Plan cards, Plan options and edit/complete/reopen/delete behavior. Added explicit create and archive controls required by the Stage 11D Plan contract. |
| `src/app/plans/[id]/page.tsx` | `src/components/plans/plan-detail.tsx` | Preserved Plan heading/date, Your Plan overview, FROM YOUR MEMORIES evidence area and original detail hierarchy. Ready Pack content is a truthful deferred state. |
| `src/types/reibry.ts` | `src/lib/plans/contracts.ts` | Adapted original Life intention and Ready Pack lifecycle vocabulary into a Plan contract with active/completed/archived states, stable UUIDs and bounded fields. |
| `src/lib/plans/{service,finalization,conversation}.ts` | Stage 11D management and selection boundary | Reused chronology/lifecycle and explicit Memory-selection concepts. Ready Pack matching, sections, guide ordering and checklist logic remain deferred. |
| Original verified store and Ready Pack migrations | Plan repository, Supabase adapter and `20261030010000_plans.sql` | Replaced broad table access with verified-session repositories, owner-scoped reads and three narrowly granted atomic functions. |

## Restored behavior

- `/plans` loads actual owner Plans plus owner Life and Memory choices. It supports create, edit, mark done, reopen, archive, restore and explicit delete.
- Cards retain the original hierarchy, dates, status wording, Memory count, contextual Life link and Plan options menu.
- `/plans/[id]` loads one owned Plan, exact selected-Memory links and its owned Life context.
- Create retries use one stable request UUID. Updates use an expected version so concurrent/stale writes fail rather than silently overwrite.
- Deleting a Plan deletes neither its Memories nor Life context.

## Security and persistence

- Session identity is server-derived. Payloads cannot set owner IDs, record IDs, versions beyond expected concurrency, timestamps or Ready Pack state.
- At most 20 unique Memory IDs are accepted. The fixed database functions verify every Memory and optional Life context belongs to `auth.uid()` in the same transaction.
- Direct authenticated writes are revoked. RLS is enabled and forced; authenticated clients have owner-select policies only.
- Creation, association replacement and optimistic updates are atomic. A unique `(user_id,idempotency_key)` prevents duplicate creates on transport retries.
- Responses are private/no-store, mutations are same-origin, request bodies are 64 KiB maximum and operations are time-bounded.
- The migration does not create profiles, roles, service-role paths or admin grants.

## Ready Pack boundary

Stage 11E must restore the original `ReadyPack` and `ReadyPackItem` contracts, plan-type inference, evidence-gated candidates, section-by-section user selection, missing-section disclosure, guide/checklist persistence and one-active-pack uniqueness. It must reference an owned Stage 11D Plan and revalidate every selected Memory. Stage 11D never fabricates a guide, checklist, generation result or completed step.

## Verification boundary

- Deterministic tests cover contracts, lifecycle, grouping, CRUD, idempotency, optimistic concurrency, rollback, same-owner references, cross-owner denial, API safety, UI states and static migration safeguards.
- Production smoke checks deny anonymous Plan API/page access. Existing auth, Memory, Capture, retrieval, Muse, Action, Life, Today and Home tests remain in the full suite.
- `supabase/tests/plans_rls.sql` is a rollback-only two-user disposable verification plan. It was not executed.
- Hosted Supabase auth, PostgreSQL functions/RLS and live Plan persistence remain **NOT VERIFIED**.
- Production HTTP smoke verified `/plans`, `/plans/[id]`, list and create boundaries deny anonymous access and redirect safely. A desktop Chrome automation attempt could not maintain a reliable target window after navigation, so no visual result is claimed from it. Authenticated 390×844, 430×932 and 1440×1000 screenshot comparison remains **UNVERIFIED** without an approved disposable session. Pixel-perfect parity is not claimed.
