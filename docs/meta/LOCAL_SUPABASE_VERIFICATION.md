# Local Supabase Verification

## Environment

- Docker Desktop and PostgreSQL 17 were already available.
- The Supabase CLI was not installed, and the repository has no
  `supabase/config.toml`.
- An unrelated running local Supabase stack was observed and left untouched.
- Stage 12A created one isolated container named
  `reibry-meta-stage12a-db`, from the already-installed
  `postgres:17-alpine` image, with no host port binding.
- A local-only bootstrap created the `anon`, `authenticated`, and `auth` roles,
  a minimal `auth.users` relation, and `auth.uid()` based on a transaction-local
  claim. It provides SQL policy semantics only; it does not emulate GoTrue or
  PostgREST.

## Executed verification

The full six-file migration chain applied successfully to a fresh database.
Catalog inspection found all eleven product tables with row-level security both
enabled and forced, five newly required foreign-key indexes, explicit function
search paths, and restricted function/table grants.

The following rollback-only suites passed on the fresh database:

- `action_rls.sql`
- `life_rls.sql`
- `memory_rls.sql`
- `plans_rls.sql`
- `ready_packs_rls.sql`

They exercised anonymous denial, owner reads/writes, cross-user denial,
same-owner foreign keys, forged ownership/reference rejection, direct-write
restrictions, idempotency, stale versions, and transaction rollback.

Additional concurrent SQL sessions verified:

- Two simultaneous Ready Pack confirmations with the same idempotency request
  produced one pack row and one stable ID; one response was the original and
  one was the duplicate result.
- Two simultaneous checklist updates at version 1 produced one successful
  version-2 update and one `stale Ready Pack` rejection.
- A confirmation/update path that encountered an invalid unattached Memory
  rolled back: version, item count, and idempotency state remained unchanged.

## Interpretation

Status: **LOCALLY VERIFIED in a disposable PostgreSQL compatibility harness**.

This is stronger than static SQL review but narrower than a local Supabase
stack. It validates PostgreSQL constraints, policies, grants, functions,
transactions, locks, and concurrent behavior. It does not validate hosted
Supabase Auth tokens, PostgREST privilege mapping, browser sessions, callback
URLs, email delivery, network controls, or hosted operational settings.

Hosted Supabase authentication, RLS, persistence, and migrations remain
**NOT VERIFIED**. Live Meta inference also remains **NOT VERIFIED**.

The exact disposable container and its anonymous volume were removed after the
verification. No other container, database, remote, or hosted service was
modified.

## Stage 12F-1 hosted-default-privilege harness

**Why the harness changed.** The original bootstrap created Supabase roles but
not hosted Supabase's default privileges. Hosted Supabase grants new `public`
tables, functions, and sequences to `anon`, `authenticated`, and `service_role`.
Without those defaults, the local harness could not detect functions that
revoked `EXECUTE` only from `PUBLIC`.

**What changed.**

- `supabase/tests/hosted_default_privileges.sql` reproduces those defaults. It
  runs locally only, after `disposable_bootstrap.sql` and before the
  migrations.
- `supabase/tests/function_acl.sql` adds the following rollback-only checks:
  - `anon` can execute no `public` function.
  - Direct anonymous calls to the three Plan RPCs and three `updated_at`
    trigger helpers fail with `insufficient_privilege`.
  - `authenticated` keeps the Plan RPCs.
  - Only `service_role` can create trusted proposals.
  - The Memory `updated_at` trigger still fires for an owner.

**Environment.** Docker was unavailable, so verification used a throwaway
PostgreSQL 18.3 cluster created with `initdb` in a session scratch directory.
It listened on localhost only, on a non-default port, and was stopped and
deleted afterwards. Hosted runs PostgreSQL 17. The ACL and default-privilege
semantics exercised here are the same in both versions.

**Baseline, before the new migration** (hosted defaults, full seven-migration
chain):

- `anon` could execute exactly the same six functions observed on hosted.
- `function_acl.sql` failed.
- `plans_rls.sql` failed with "anonymous Plan RPC succeeded". In that suite the
  anonymous step still carries User B's transaction-local `sub` claim, so the
  RPC's `auth.uid()` guard alone did not stop it. Removing `anon`'s `EXECUTE`
  grant closes this path at the privilege layer.

**After applying `20261030040000_restrict_anon_function_execute.sql`.** These
suites passed:

- `function_acl.sql`
- `memory_rls.sql`
- `life_rls.sql`
- `action_rls.sql`
- `plans_rls.sql`
- `ready_packs_rls.sql`

The checks covered:

- owner Plan create/update/delete paths;
- cross-user denial;
- service-only trusted proposal creation;
- `updated_at` trigger behaviour.

The `authenticated` and `service_role` function ACLs matched hosted exactly,
and no rows remained after the rollback-only suites.
