# Hosted Supabase Verification Runbook

This runbook is for a newly confirmed disposable development project. It is not
authorization to modify the currently configured project.

## Owner prerequisites

1. Confirm the project reference and purpose out-of-band as disposable and
   record who may delete it.
2. Configure these ignored server variables without sharing values:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `AUTH_ENABLED=true`, and the exact `AUTH_SITE_URL`.
3. Use a modern Supabase secret key only on the server. Never expose it through
   `NEXT_PUBLIC_*`, browser code, URLs, screenshots, logs, or test output.
   Purge and exclude framework/compiler caches on shared or CI machines after
   builds that loaded real credentials; Stage 12B observed an ignored Turbopack
   cache retaining the Meta key even though deployable bundles did not.
4. Approve migration application as a separate hosted write operation.
5. Approve creation of two disposable email users and synthetic records as a
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
