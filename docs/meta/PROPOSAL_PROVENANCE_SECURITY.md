# Action Proposal Provenance Security

## Original vulnerability

The Stage 9 migration granted `authenticated` users direct execution of
`create_action_proposals(jsonb, text)`. The function correctly enforced owner
Memory references, but any signed-in user could submit arbitrary bounded text,
label it `meta:muse-spark-1.3`, and later confirm it. This was an integrity and
provenance flaw, not a cross-user disclosure.

## Stage 12B boundary

Migration `20261030030000_trusted_action_proposals.sql`:

- revokes and drops the old authenticated proposal-creation RPC;
- adds `create_trusted_action_proposals(uuid,jsonb,text,uuid)`;
- grants the new function only to `service_role`;
- marks new rows `server-validated-meta` with a server request ID and stable
  item ordinal;
- serializes retries with a transaction advisory lock and verifies exact
  payload/evidence equality before returning an existing request;
- rechecks user existence and every same-owner Memory reference;
- rejects confirmation of `legacy-unverified` proposals; and
- preserves authenticated owner-only confirmation and rejection.

The application verifies the user through `auth.getUser()`, performs owner-only
retrieval, validates Muse's structured response and exact citations, and only
then calls the trusted RPC. The elevated client lives in
`src/lib/supabase/trusted-server.ts`, imports `server-only`, accepts only a
server-side `SUPABASE_SECRET_KEY` with the modern `sb_secret_` shape, disables
session persistence/refresh, and is passed only to the proposal repository.
Ordinary reads, confirmation, rejection, Memories, Life, Plans, and Ready Packs
continue to use the user's non-elevated session client.

## Trust guarantee

This provides **server-controlled provenance**, not cryptographic attestation
of a model response. The server is the trusted computing boundary: it validates
the provider output before writing and the database proves that ordinary
authenticated callers cannot use the trusted RPC. A compromised application
server or leaked Supabase secret could still forge proposals. Key rotation,
server access control, audit logging without private content, and deployment
secret isolation remain operational requirements.

Existing proposals created before this migration remain readable/rejectable but
cannot become Action Cards. This fail-closed behavior intentionally favors
integrity over backward compatibility.

## Local verification

All seven migrations applied to a fresh, unexposed PostgreSQL 17 container.
Catalog checks returned:

- `authenticated` execute on trusted creation: false;
- `anon` execute on trusted creation: false;
- `service_role` execute on trusted creation: true; and
- old proposal-creation function present: false.

Rollback-only SQL tests proved trusted creation, authenticated/anonymous
denial, cross-owner rejection, invalid-ID rollback, same-request idempotency,
explicit confirmation, owner-bound rejection, status-write denial, and Plan /
Ready Pack regressions. The container and anonymous volume were removed.

The migration has **not** been applied to any hosted project. Until it is
approved and applied together with a configured `SUPABASE_SECRET_KEY`, hosted
proposal creation is not ready.
