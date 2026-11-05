# Database Migration Audit

Stage 12A audited the complete local migration chain at commit parent
`ceca795eba13c73bc2359f7a0348ad52ae104a62`. No hosted project was linked or
modified. The migration chain was applied to an isolated PostgreSQL 17 Docker
database with a local-only compatibility bootstrap for Supabase roles and
`auth.uid()`.

## Ordered migration graph

1. `20261027000000_memory_foundation.sql` creates owned Memories.
2. `20261027010000_capture_deduplication.sql` adds owner-scoped capture
   deduplication to Memories.
3. `20261029000000_confirmed_actions.sql` adds inert Action proposals,
   proposal-to-Memory evidence, and confirmed Action Cards.
4. `20261030000000_life_contexts.sql` adds Life contexts and read-only
   Memory-to-Life matches.
5. `20261030010000_plans.sql` adds Plans and same-owner Plan-to-Memory/Life
   references.
6. `20261030020000_ready_packs.sql` adds Ready Packs, sections, and
   Plan-attached Memory selections.

The chain defines eleven product tables. Every product table has row-level
security enabled and forced. Composite owner foreign keys prevent a relation
from crossing user boundaries. Mutation functions derive identity from
`auth.uid()`; no function accepts a caller-supplied owner as authority.

## Corrections made by this audit

- Added supporting indexes for the reverse side of owner-scoped foreign keys:
  Action-proposal Memory, Plan Life-context, Plan Memory, Ready Pack Plan, and
  Ready Pack item Memory references.
- Strengthened Ready Pack confirmation to derive the title and permitted pack
  type from the locked owned Plan, reject an empty selection, cap selections at
  20, and reject duplicate Memory IDs across sections.
- Kept the existing Plan-membership and same-owner checks, idempotency key,
  row lock, and optimistic checklist version checks.
- Converted the Plan and Ready Pack SQL notes into executable rollback-only
  two-user tests. Corrected the Memory and Life fixtures to respect their
  column-level insert grants instead of supplying server-generated IDs.
- Added a clearly marked local-only bootstrap for disposable vanilla
  PostgreSQL. It must never be applied to a hosted Supabase project.

## Access-control findings

- Memory and Life tables permit authenticated owner CRUD only on explicitly
  granted columns. Ownership cannot be reassigned.
- Action, Plan, and Ready Pack tables expose direct authenticated reads only;
  writes use narrowly granted functions with owner checks.
- Anonymous access, cross-owner reads/writes/references, stale versions, and
  invalid confirmation transitions were denied in the disposable database.
- Security-definer functions use explicit search paths and validate
  `auth.uid()`. Trigger functions are not granted to application roles.
- The application server uses a publishable-key, user-session client and
  verifies identity with `auth.getUser()`. No user-facing service-role client
  was found.

## Stage 12B provenance resolution and residual risks

Stage 12B adds a seventh migration that drops the authenticated proposal RPC,
introduces service-only trusted creation, records a server request identity,
and blocks confirmation of legacy-unverified proposals. The elevated client is
isolated to this operation; ordinary owner reads and writes remain user-scoped.
This resolves the direct authenticated forgery path locally.

The guarantee is server-controlled provenance, not cryptographic model
attestation. A compromised application server or leaked Supabase secret could
still forge a proposal. The seventh migration and `SUPABASE_SECRET_KEY` are not
configured/applied in a hosted environment, so the fix is not live.

Likewise, permitted direct Memory and Life writes are owner-isolated but are
not proof that content passed through the application API. If release policy
requires server-authored provenance, direct grants need a separately reviewed
redesign.

The local harness did not run Supabase Auth, PostgREST, GoTrue, or a hosted
network boundary. Hosted migration application, callback configuration, email
authentication, two-user browser behavior, and production-scale query plans
remain unverified.

## Controlled hosted review for Stage 12B

Only after the owner creates a brand-new disposable Supabase project and
explicitly approves external changes:

1. Install and authenticate a current official Supabase CLI separately.
2. Verify the CLI's current migration-preview syntax against official docs.
3. Link only the disposable project, for example
   `supabase link --project-ref <DISPOSABLE_PROJECT_REF>`.
4. Preview the migration set (commonly `supabase db push --dry-run`) and review
   every statement before any apply operation.
5. Apply only after owner approval, then run the repository SQL tests in a
   transaction and inspect grants, policies, function ownership, and logs.
6. Create two disposable email users, A and B. In separate browser profiles,
   verify self-service operations, anonymous denial, A/B isolation, forged
   references, idempotent confirmations, stale-version conflicts, and rollback.
7. Delete the disposable project or test users only under a separate explicit
   owner instruction.

These commands were not executed in Stage 12A. No hosted Supabase result is
claimed.
