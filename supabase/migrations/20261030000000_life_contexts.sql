-- REIBRY Meta Edition Stage 11A. Apply only to an approved disposable project.
-- Adapted from original REIBRY 20260919000000_initial_foundation.sql; no profiles or role grants.
begin;
create table public.life_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('event','goal','deadline','trip','task','project','interest','reminder')),
  title text not null check (char_length(trim(title)) between 1 and 300),
  description text check (description is null or char_length(description) <= 20000),
  start_date timestamptz,
  end_date timestamptz,
  status text not null default 'active' check (status in ('active','completed','cancelled','archived')),
  confidence double precision check (confidence between 0 and 1),
  dedupe_key text check (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (id, user_id)
);
create index life_contexts_owner_status_start_idx on public.life_contexts(user_id,status,start_date,id);
create unique index life_contexts_owner_dedupe_idx on public.life_contexts(user_id,dedupe_key) where dedupe_key is not null;
create function public.set_life_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
revoke all on function public.set_life_updated_at() from public;
create trigger set_life_updated_at before update on public.life_contexts for each row execute function public.set_life_updated_at();

-- Preserve the original owner-safe Memory/Life relationship for Stage 11B matching.
-- Authenticated clients receive read-only access; a later fixed server RPC must create matches.
create table public.memory_context_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null,
  life_context_id uuid not null,
  similarity double precision not null check (similarity between -1 and 1),
  confidence double precision check (confidence between 0 and 1),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  suggested_action jsonb check (suggested_action is null or jsonb_typeof(suggested_action)='object'),
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id), unique(user_id,memory_id,life_context_id),
  foreign key(memory_id,user_id) references public.memories(id,user_id) on delete cascade,
  foreign key(life_context_id,user_id) references public.life_contexts(id,user_id) on delete cascade
);
create index memory_context_matches_owner_life_idx on public.memory_context_matches(user_id,life_context_id,status);

alter table public.life_contexts enable row level security;
alter table public.life_contexts force row level security;
revoke all on table public.life_contexts from public,anon,authenticated;
grant select,delete on table public.life_contexts to authenticated;
grant insert(user_id,type,title,description,start_date,end_date,status,confidence,dedupe_key) on public.life_contexts to authenticated;
grant update(type,title,description,start_date,end_date,status) on public.life_contexts to authenticated;
create policy life_owner_select on public.life_contexts for select to authenticated using ((select auth.uid())=user_id);
create policy life_owner_insert on public.life_contexts for insert to authenticated with check ((select auth.uid())=user_id);
create policy life_owner_update on public.life_contexts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy life_owner_delete on public.life_contexts for delete to authenticated using ((select auth.uid())=user_id);

alter table public.memory_context_matches enable row level security;
alter table public.memory_context_matches force row level security;
revoke all on table public.memory_context_matches from public,anon,authenticated;
grant select on table public.memory_context_matches to authenticated;
create policy match_owner_select on public.memory_context_matches for select to authenticated using ((select auth.uid())=user_id);
commit;
