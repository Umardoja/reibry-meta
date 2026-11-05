-- Stage 11D: owner-bound original REIBRY Plans. Prepared locally; never applied by this migration run.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text check (description is null or char_length(description) <= 4000),
  start_date timestamptz,
  status text not null default 'active' check (status in ('active','completed','archived')),
  life_context_id uuid,
  idempotency_key uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),
  constraint plans_life_owner_fk foreign key (life_context_id, user_id)
    references public.life_contexts(id, user_id) on delete set null (life_context_id)
);

create table if not exists public.plan_memories (
  plan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, memory_id),
  constraint plan_memories_plan_owner_fk foreign key (plan_id, user_id)
    references public.plans(id, user_id) on delete cascade,
  constraint plan_memories_memory_owner_fk foreign key (memory_id, user_id)
    references public.memories(id, user_id) on delete cascade
);

create index if not exists plans_owner_status_date_idx on public.plans(user_id, status, start_date, created_at desc);
create index if not exists plans_life_owner_idx on public.plans(life_context_id, user_id) where life_context_id is not null;
create index if not exists plan_memories_owner_plan_idx on public.plan_memories(user_id, plan_id);
create index if not exists plan_memories_memory_owner_idx on public.plan_memories(memory_id, user_id);
alter table public.plans enable row level security;
alter table public.plans force row level security;
alter table public.plan_memories enable row level security;
alter table public.plan_memories force row level security;
revoke all on table public.plans, public.plan_memories from anon, authenticated;
grant select on table public.plans, public.plan_memories to authenticated;
drop policy if exists plans_owner_select on public.plans;
create policy plans_owner_select on public.plans for select to authenticated using (auth.uid() = user_id);
drop policy if exists plan_memories_owner_select on public.plan_memories;
create policy plan_memories_owner_select on public.plan_memories for select to authenticated using (auth.uid() = user_id);

create or replace function public.create_owned_plan(
  p_title text, p_description text, p_start_date timestamptz, p_life_context_id uuid,
  p_memory_ids uuid[], p_idempotency_key uuid
) returns table(plan_id uuid, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid := auth.uid(); v_plan uuid; v_duplicate boolean := false;
begin
  if v_user is null then raise exception using errcode = '42501'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 300 or p_description is not null and char_length(p_description) > 4000 then raise exception using errcode = '23514'; end if;
  if coalesce(array_length(p_memory_ids, 1), 0) > 20 or (select count(*) from unnest(coalesce(p_memory_ids, '{}'::uuid[]))) <> (select count(distinct value) from unnest(coalesce(p_memory_ids, '{}'::uuid[])) value) then raise exception using errcode = '23514'; end if;
  if p_life_context_id is not null and not exists (select 1 from public.life_contexts where id = p_life_context_id and user_id = v_user) then raise exception using errcode = '23503'; end if;
  if exists (select 1 from unnest(coalesce(p_memory_ids, '{}'::uuid[])) value where not exists (select 1 from public.memories where id = value and user_id = v_user)) then raise exception using errcode = '23503'; end if;
  select id into v_plan from public.plans where user_id = v_user and idempotency_key = p_idempotency_key;
  if v_plan is not null then v_duplicate := true; return query select v_plan, v_duplicate; return; end if;
  insert into public.plans(user_id,title,description,start_date,life_context_id,idempotency_key)
    values(v_user,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),p_start_date,p_life_context_id,p_idempotency_key)
    on conflict (user_id,idempotency_key) do nothing returning id into v_plan;
  if v_plan is null then
    select id into v_plan from public.plans where user_id = v_user and idempotency_key = p_idempotency_key;
    v_duplicate := true;
  end if;
  if not v_duplicate then insert into public.plan_memories(plan_id,user_id,memory_id) select v_plan,v_user,value from unnest(coalesce(p_memory_ids,'{}'::uuid[])) value; end if;
  return query select v_plan, v_duplicate;
end $$;

create or replace function public.update_owned_plan(
  p_plan_id uuid, p_expected_version integer,
  p_title text, p_set_title boolean, p_description text, p_set_description boolean,
  p_start_date timestamptz, p_set_start_date boolean, p_status text,
  p_life_context_id uuid, p_set_life_context boolean, p_memory_ids uuid[]
) returns table(plan_id uuid)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid := auth.uid(); v_current public.plans%rowtype;
begin
  if v_user is null then raise exception using errcode = '42501'; end if;
  select * into v_current from public.plans where id = p_plan_id and user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002'; end if;
  if v_current.version <> p_expected_version then raise exception using errcode = '40001'; end if;
  if p_set_title and (p_title is null or char_length(btrim(p_title)) not between 1 and 300) or p_set_description and p_description is not null and char_length(p_description) > 4000 then raise exception using errcode = '23514'; end if;
  if p_status is not null and p_status not in ('active','completed','archived') then raise exception using errcode = '23514'; end if;
  if p_status is not null and not (p_status = v_current.status or v_current.status = 'active' and p_status in ('completed','archived') or v_current.status = 'completed' and p_status in ('active','archived') or v_current.status = 'archived' and p_status = 'active') then raise exception using errcode = '23514'; end if;
  if p_set_life_context and p_life_context_id is not null and not exists (select 1 from public.life_contexts where id = p_life_context_id and user_id = v_user) then raise exception using errcode = '23503'; end if;
  if p_memory_ids is not null and (coalesce(array_length(p_memory_ids,1),0) > 20 or (select count(*) from unnest(p_memory_ids)) <> (select count(distinct value) from unnest(p_memory_ids) value) or exists (select 1 from unnest(p_memory_ids) value where not exists (select 1 from public.memories where id = value and user_id = v_user))) then raise exception using errcode = '23503'; end if;
  update public.plans set title = case when p_set_title then btrim(p_title) else title end,
    description = case when p_set_description then nullif(btrim(coalesce(p_description,'')),'') else description end,
    start_date = case when p_set_start_date then p_start_date else start_date end,
    status = coalesce(p_status,status), life_context_id = case when p_set_life_context then p_life_context_id else life_context_id end,
    version = version + 1, updated_at = now() where id = p_plan_id and user_id = v_user;
  if p_memory_ids is not null then delete from public.plan_memories where plan_id = p_plan_id and user_id = v_user; insert into public.plan_memories(plan_id,user_id,memory_id) select p_plan_id,v_user,value from unnest(p_memory_ids) value; end if;
  return query select p_plan_id;
end $$;

create or replace function public.delete_owned_plan(p_plan_id uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user uuid := auth.uid(); v_deleted integer;
begin
  if v_user is null then raise exception using errcode = '42501'; end if;
  delete from public.plans where id = p_plan_id and user_id = v_user; get diagnostics v_deleted = row_count; return v_deleted = 1;
end $$;

revoke all on function public.create_owned_plan(text,text,timestamptz,uuid,uuid[],uuid) from public;
revoke all on function public.update_owned_plan(uuid,integer,text,boolean,text,boolean,timestamptz,boolean,text,uuid,boolean,uuid[]) from public;
revoke all on function public.delete_owned_plan(uuid) from public;
grant execute on function public.create_owned_plan(text,text,timestamptz,uuid,uuid[],uuid) to authenticated;
grant execute on function public.update_owned_plan(uuid,integer,text,boolean,text,boolean,timestamptz,boolean,text,uuid,boolean,uuid[]) to authenticated;
grant execute on function public.delete_owned_plan(uuid) to authenticated;
