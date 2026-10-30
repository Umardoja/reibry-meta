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

## Approved two-user test plan

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
