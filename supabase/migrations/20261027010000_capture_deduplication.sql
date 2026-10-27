-- REIBRY Meta Edition Stage 6. Apply only to a newly approved disposable project after Stage 5.
-- Owner-scoped atomic deduplication; no hosted database was contacted during this milestone.
begin;

alter table public.memories
  add column dedupe_key text
  check (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$');

grant insert (dedupe_key) on table public.memories to authenticated;

create unique index memories_owner_dedupe_key_idx
  on public.memories (user_id, dedupe_key)
  where dedupe_key is not null;

commit;
