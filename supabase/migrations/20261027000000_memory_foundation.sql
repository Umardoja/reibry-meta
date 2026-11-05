-- REIBRY Meta Edition Stage 5. Apply only to a newly approved disposable project.
-- Adapted from original REIBRY migration 20260919000000_initial_foundation.sql.
begin;

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  source_type text not null check (source_type in ('text', 'link')),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https?://')),
  raw_text text check (raw_text is null or char_length(raw_text) between 1 and 50000),
  analysis_status text not null default 'processing' check (analysis_status in ('processing', 'complete', 'partial', 'failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_source_present check (
    (source_type = 'text' and raw_text is not null and char_length(trim(raw_text)) > 0)
    or (source_type = 'link' and source_url is not null)
  ),
  unique (id, user_id)
);

create index memories_owner_created_id_idx on public.memories (user_id, created_at desc, id desc);

create function public.set_memory_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_memory_updated_at() from public;
create trigger set_memory_updated_at before update on public.memories
for each row execute function public.set_memory_updated_at();

alter table public.memories enable row level security;
alter table public.memories force row level security;
revoke all on table public.memories from public, anon, authenticated;
grant select, delete on table public.memories to authenticated;
grant insert (user_id, title, source_type, source_url, raw_text, analysis_status, metadata) on table public.memories to authenticated;
grant update (title, raw_text) on table public.memories to authenticated;

create policy memory_owner_select on public.memories for select to authenticated
  using ((select auth.uid()) = user_id);
create policy memory_owner_insert on public.memories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy memory_owner_update on public.memories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy memory_owner_delete on public.memories for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
