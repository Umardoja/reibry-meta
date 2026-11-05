# Hosted Supabase Verification Runbook

This runbook is for a newly confirmed disposable development project. It is not
authorization to modify the currently configured project.

## Owner prerequisites

1. Confirm the project reference and purpose out-of-band as disposable and
   record who may delete it.
2. Configure these ignored server variables without sharing values:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `AUTH_ENABLED=true`, the exact `AUTH_SITE_URL`, and
   `META_RATE_LIMIT_MODE=in-memory` for a single local instance. No other
   spellings or values currently enable these gates. `AUTH_SITE_URL` must be
   the canonical app origin only (HTTPS except an exact loopback HTTP origin,
   with no path/query/fragment/credentials), and Supabase Auth must allow the
   resulting `<origin>/auth/callback` redirect.
3. Use a modern Supabase secret key only on the server. Never expose it through
   `NEXT_PUBLIC_*`, browser code, URLs, screenshots, logs, or test output.
   Purge and exclude framework/compiler caches on shared or CI machines after
   builds that loaded real credentials; Stage 12B observed an ignored Turbopack
   cache retaining the Meta key even though deployable bundles did not.
   The application accepts only the `sb_secret_...` form and isolates it to the
   trusted proposal RPC. Supabase documents that this key maps to
   `service_role` and bypasses RLS, so the server's prior session, Muse-output,
   citation, and owner checks are mandatory. It is not required for ordinary
   authenticated reads or CRUD.
4. Treat `META_RATE_LIMIT_MODE=in-memory` as local/staging opt-in only. The
   current limiter is per process; production with multiple instances requires
   a shared atomic limiter before release.
5. Approve migration application as a separate hosted write operation.
6. Approve creation of two disposable email users and synthetic records as a
   separate hosted write operation.

## Migration review

With a current official Supabase CLI installed and after confirming the target:

```text
supabase link --project-ref <DISPOSABLE_PROJECT_REF>
supabase db push --dry-run
```

Review all seven migrations, especially function owners, `SECURITY DEFINER`
search paths, grants, forced RLS, composite owner foreign keys, the dropped old
proposal RPC, and the service-only trusted RPC. Do not run `db push`, `db reset`,
`migration repair`, or dashboard SQL without explicit approval.

Stage 12C found no local Supabase link marker. The configured endpoint is
reachable, but Auth settings alone do not establish project identity or
disposability. Read-only probes found the application tables absent. The owner
must first confirm the exact project reference out-of-band; linking, dry-run,
migration application, account creation, and data writes are separate approval
steps.

Stage 12D repeated the read-only preflight with the same result: Auth is
reachable, but all application-table probes return 404. The owner has not yet
affirmatively confirmed the configured project reference as the separate
disposable REIBRY Meta staging project. The Supabase CLI is also unavailable.
For those two independent reasons, project linking, remote migration-history
inspection, and `supabase db push --dry-run` were not run.

The next authorized staging operation must begin with the owner's explicit
out-of-band confirmation of the exact project reference. Then install or make a
reviewed current Supabase CLI available, link only that confirmed project, and
run `supabase db push --dry-run`. That approval must not include real `db push`,
user creation, dashboard changes, migration repair, reset, or row writes.

## Stage 12E-1 preflight result (2026-10-30)

The owner subsequently confirmed that the project configured in the ignored
`.env.local` is the disposable Meta development project. The project-scoped
official Supabase CLI (`2.122.0`) was installed and its local state is ignored.
The configured URL yielded a syntactically valid project reference, but that
reference was not present in the authenticated CLI account's accessible project
list. No reference, URL, token, or project name is recorded here.

This is an identity/access mismatch, so the CLI was **not linked** and
`supabase db push --dry-run` was **not run**. Treat the project identity as not
yet independently verified despite the owner's confirmation. Before continuing,
the owner must authenticate the CLI as an account with access to the confirmed
development project, or grant that account the required project access; then
repeat the private exact-reference comparison. Only after it matches may the
authorized link and dry-run occur. No hosted schema, migration-history, user,
or data operation was attempted in this stage.

The seven local migrations remain, in order:

1. `20261027000000_memory_foundation.sql`
2. `20261027010000_capture_deduplication.sql`
3. `20261029000000_confirmed_actions.sql`
4. `20261030000000_life_contexts.sql`
5. `20261030010000_plans.sql`
6. `20261030020000_ready_packs.sql`
7. `20261030030000_trusted_action_proposals.sql`

Configuration presence was checked without reading values. All required local
names are present except `SUPABASE_SECRET_KEY`; that server-only secret remains
required only for trusted proposal persistence after the seventh migration is
applied. It must retain the accepted `sb_secret_` form and never enter a client
bundle. `AUTH_ENABLED=true`, a canonical `AUTH_SITE_URL`, and
`META_RATE_LIMIT_MODE=in-memory` are already present and passed their local
parsers; the in-memory limiter is not sufficient for multi-instance production.

## Stage 12E-2 hosted migration result (2026-10-30)

**Access recovery (12E-1 resumed).** After the owner reauthenticated, the CLI
account's project list contained the exact reference derived from the
configured URL. The CLI was linked to that project only. `db push --dry-run`
listed exactly the seven migrations above, and the remote migration history was
empty.

**Read-only preflight (12E-2A).** Catalog inspection used
`supabase db query --linked` with every statement inside
`begin transaction read only`. The server confirmed `transaction_read_only=on`.

- **Application objects:** `public` held no tables, views, functions, types,
  policies, or triggers. There were no non-system schemas besides `public`.
- **Auth:** `auth.users` had zero rows and no triggers.
- **Dependencies:** `auth.uid()` and `gen_random_uuid()` exist; `pgcrypto` is
  installed in `extensions`.
- **Migration history:** `supabase_migrations.schema_migrations` did not exist.

**Migration application (12E-2B).** One owner-approved
`supabase db push --linked` applied all seven migrations in order without
error. No seed or role options were used, and nothing was retried, repaired,
or reset. `supabase migration list --linked` shows all seven versions recorded
both locally and remotely.

**Post-deployment catalog checks** (read-only transaction):

- **Objects in `public`:**

  | Object | Count |
  | --- | --- |
  | Tables | 11 |
  | Views | 0 |
  | Functions | 11 |
  | Policies | 17 |
  | Non-internal triggers | 4 |
  | Indexes | 45 |
  | Check constraints | 42 |
  | Foreign keys | 21 |
  | Primary keys | 11 |
  | Unique constraints | 13 |

  The function count is 13 `create` statements, minus the redefined
  `confirm_action_proposal`, minus the dropped legacy `create_action_proposals`.
- **Row-level security:** enabled and forced on all 11 product tables.
- **Trusted proposal RPC:** `create_trusted_action_proposals` is executable
  only by `service_role` (anon=false, authenticated=false). The legacy
  `create_action_proposals` is absent.
- **Table privileges:** `anon` has no table privileges. `authenticated` has
  `SELECT` everywhere. It also has `DELETE` plus column-scoped `INSERT`/`UPDATE`
  on `memories` and `life_contexts` only.
- **Data:** zero rows in every product table and zero Auth users.

**Privilege finding (corrected in Stage 12F-1; see below).** Hosted Supabase default privileges
grant `EXECUTE` on new `public` functions to `anon`, `authenticated`, and
`service_role`. The Plans migration revokes only from `PUBLIC`, so `anon`
retains `EXECUTE` on these `SECURITY DEFINER` functions:

- `create_owned_plan`
- `update_owned_plan`
- `delete_owned_plan`

`anon` also retains `EXECUTE` on the three `set_*_updated_at` trigger functions.

Practical exposure is limited:

- Each Plans RPC raises `42501` as its first statement when `auth.uid()` is
  null.
- Trigger functions cannot be invoked directly.
- `service_role` likewise retains `EXECUTE` on most owner RPCs, but they depend
  on `auth.uid()`.

This is still a defense-in-depth gap compared with the Ready Pack migration,
which revokes from `anon` explicitly. Closing it requires a new, separately
approved forward migration that revokes these grants from `anon`. Do not edit
already-applied migrations, and do not repair or reset.

**Not yet verified.** Catalog checks do not prove real two-user isolation.
Hosted RLS and persistence remain **NOT VERIFIED** until the approved two-user
plan below succeeds.

**Remaining prerequisites for the authenticated demo:**

- Configure server-only `SUPABASE_SECRET_KEY` (`sb_secret_` form) in the
  ignored `.env.local`. It is still absent and is needed only for trusted
  proposal creation.
- Confirm that Supabase Auth allows the configured `<AUTH_SITE_URL>/auth/callback`
  redirect and the intended email sign-in method.
- Separately approve creating two disposable users and synthetic records.

## Stage 12F-1 anonymous function execution hardening (2026-10-30)

**What changed.** Forward-only migration
`20261030040000_restrict_anon_function_execute.sql` revokes `EXECUTE` from
`PUBLIC` and `anon` on six functions, using exact signatures:

- `create_owned_plan`
- `update_owned_plan`
- `delete_owned_plan`
- `set_action_updated_at`
- `set_life_updated_at`
- `set_memory_updated_at`

It does not change `authenticated` or `service_role` grants. It ends with an
in-transaction guard that aborts the migration if `anon` can still execute any
`public` function.

**Source of the grants.** Before the change, each of the six ACLs contained a
direct `anon=X/postgres` entry inherited from the `postgres` default-privilege
rule for functions in `public`. No function had a `PUBLIC` entry. No
`SECURITY DEFINER` function outside `public` (excluding extension-owned
functions) was executable by `anon`.

**Hosted application.** After the identity re-check, the dry-run listed only
the new migration. It was applied once with `supabase db push --linked`.

**Hosted read-only verification** (inside a read-only transaction):

- **Migration history:** eight versions recorded.
- **`anon`:** cannot execute any of the 11 `public` functions.
- **Other roles:** the `authenticated` and `service_role` ACL entries match
  the pre-migration catalog exactly.
- **Trusted proposal RPC:** `create_trusted_action_proposals` remains executable
  only by `service_role`.
- **Unchanged state:** all 11 tables still have forced RLS; zero Auth users;
  zero product rows.

Two-user hosted RLS and persistence remain **NOT VERIFIED**; the prerequisites
above are unchanged.

(Stage 12F-2 later verified two-user isolation and persistence live; see
[HOSTED_AUTH_PERSISTENCE_RESULTS.md](HOSTED_AUTH_PERSISTENCE_RESULTS.md).)

## Stage 12F-3 stale-version conflict fix (2026-10-30)

**Migration.** `20261030050000_stale_version_conflict_sqlstate.sql` replaces
three functions, changing only the conflict SQLSTATE from `40001` to `PT409`:

- `update_owned_plan`
- `update_owned_ready_pack_checklist`
- `confirm_owned_ready_pack` (two sites)

The migration's guard confirms that `SECURITY DEFINER`, `search_path`, and
EXECUTE grants are unchanged. The hosted history now has nine versions. The
full account is in [POSTGREST_CONFLICT_FIX.md](POSTGREST_CONFLICT_FIX.md).

### Rules for future migrations

- **Never use `40001` (or another retryable SQLSTATE) for a business
  conflict.** The hosted PostgREST (14.18) re-runs the transaction
  indefinitely, even after the client disconnects. Use a PostgREST status code
  such as `PT409`.
- **Verify conflict and error paths through PostgREST at the hosted version.**
  Direct-SQL harness results do not establish HTTP behavior.

### Detecting a runaway retry loop (read-only)

Look for:

- a fast-rising `pg_stat_database.xact_rollback` with almost no commits;
- `authenticator` client backends in
  `active` / `idle in transaction (aborted)` state, running a
  `WITH pgrst_source …` call to the affected RPC.

Replacing the offending function with a non-retryable SQLSTATE ends the loop.
No session termination is needed.

### CLI identity check

The CLI account can lose project visibility between stages; this happened
during Stage 12F-3. Repeat the private reference comparison before every hosted
write.

After migrations and account creation receive approval:

- sign in A and B in isolated browser profiles;
- verify each user sees only their own Memories, Life, Plans, Ready Packs,
  proposals, and Action Cards;
- verify A cannot reference B's IDs through any API or RPC;
- verify authenticated and anonymous callers cannot invoke trusted proposal
  creation directly;
- invoke Ask/Home through the server and verify only a validated synthetic Muse
  suggestion can create a proposal;
- verify explicit confirmation, rejection, same-request idempotency, stale
  version denial, transaction rollback, and refresh persistence; and
- inspect hosted logs for safe error categories without private source text.

Keep test data synthetic. Do not use original REIBRY production resources or
personal Memories. Hosted RLS and end-to-end persistence remain unverified until
this plan actually succeeds.
