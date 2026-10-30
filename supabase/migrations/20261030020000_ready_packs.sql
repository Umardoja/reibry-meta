-- Stage 11E: owner-bound Plans become persistent Ready Packs only after explicit selection.
-- This migration is version controlled only; it is not applied by the migration task.
create table if not exists public.ready_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  pack_type text not null check (pack_type in ('travel','event','learning')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  version integer not null default 1 check (version > 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), unique (user_id,idempotency_key),
  constraint ready_packs_plan_owner_fk foreign key (plan_id,user_id) references public.plans(id,user_id) on delete cascade
);
create unique index if not exists ready_packs_one_active_per_plan_idx on public.ready_packs(user_id,plan_id) where status='active';
create index if not exists ready_packs_owner_created_idx on public.ready_packs(user_id,created_at desc,id);
create index if not exists ready_packs_plan_owner_idx on public.ready_packs(plan_id,user_id);

create table if not exists public.ready_pack_sections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  ready_pack_id uuid not null, name text not null check (char_length(name) between 1 and 80),
  position smallint not null check (position between 0 and 12), reviewed boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (ready_pack_id,user_id,name),
  constraint ready_pack_sections_pack_owner_fk foreign key (ready_pack_id,user_id) references public.ready_packs(id,user_id) on delete cascade
);
create table if not exists public.ready_pack_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  ready_pack_id uuid not null, memory_id uuid not null, section text not null,
  relevance_reason text not null check (char_length(relevance_reason) between 1 and 500),
  relevance_strength text not null default 'strong' check (relevance_strength in ('direct','strong','related')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (ready_pack_id,memory_id),
  constraint ready_pack_items_section_owner_fk foreign key (ready_pack_id,user_id,section) references public.ready_pack_sections(ready_pack_id,user_id,name) on delete cascade,
  constraint ready_pack_items_memory_owner_fk foreign key (memory_id,user_id) references public.memories(id,user_id) on delete cascade
);
create index if not exists ready_pack_sections_owner_pack_idx on public.ready_pack_sections(user_id,ready_pack_id,position);
create index if not exists ready_pack_items_owner_pack_idx on public.ready_pack_items(user_id,ready_pack_id,section);
create index if not exists ready_pack_items_memory_owner_idx on public.ready_pack_items(memory_id,user_id);

alter table public.ready_packs enable row level security; alter table public.ready_packs force row level security;
alter table public.ready_pack_sections enable row level security; alter table public.ready_pack_sections force row level security;
alter table public.ready_pack_items enable row level security; alter table public.ready_pack_items force row level security;
create policy ready_packs_owner_read on public.ready_packs for select using (auth.uid()=user_id);
create policy ready_pack_sections_owner_read on public.ready_pack_sections for select using (auth.uid()=user_id);
create policy ready_pack_items_owner_read on public.ready_pack_items for select using (auth.uid()=user_id);
revoke all on table public.ready_packs,public.ready_pack_sections,public.ready_pack_items from anon,authenticated;
grant select on table public.ready_packs,public.ready_pack_sections,public.ready_pack_items to authenticated;

create or replace function public.confirm_owned_ready_pack(
  p_plan_id uuid,p_pack_type text,p_title text,p_selections jsonb,p_reasons jsonb,p_idempotency_key uuid,p_expected_version integer default null
) returns table(pack_id uuid,duplicate boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_pack uuid;v_version integer;v_existing_request uuid;v_sections text[];v_section text;v_ids jsonb;v_memory text;v_position integer:=0;v_selection_count integer;v_unique_count integer;v_plan_title text;v_plan_text text;v_life_type text;v_expected_type text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select p.title,lower(p.title||' '||coalesce(p.description,'')),l.type into v_plan_title,v_plan_text,v_life_type
    from public.plans p left join public.life_contexts l on l.id=p.life_context_id and l.user_id=p.user_id
    where p.id=p_plan_id and p.user_id=v_user and p.status='active' for update of p;
  if not found then raise exception 'invalid plan' using errcode='23503'; end if;
  if v_life_type='trip' or v_plan_text ~ '\m(trip|travel|flight|hotel|holiday|vacation)\M' then v_expected_type:='travel';
  elsif v_plan_text ~ '\m(learn|learning|study|tutorial|revision|exam|python|backend|course)\M' then v_expected_type:='learning';
  elsif v_life_type='event' or v_plan_text ~ '\m(birthday|party|wedding|event|conference)\M' then v_expected_type:='event';
  else raise exception 'unsupported plan' using errcode='23514'; end if;
  if p_pack_type<>v_expected_type then raise exception 'invalid pack type' using errcode='23514'; end if;
  if p_pack_type='travel' then v_sections:=array['Places','Food','Stay','Travel tips'];
  elsif p_pack_type='event' then v_sections:=array['Cake ideas','Gift ideas','Places to go','Activities'];
  else v_sections:=array['Tutorials','Topics','Practice','Resources']; end if;
  if p_title is distinct from v_plan_title or jsonb_typeof(p_selections)<>'object' then raise exception 'invalid payload' using errcode='23514'; end if;
  if exists(select 1 from jsonb_object_keys(p_selections) key where not (key=any(v_sections))) then raise exception 'invalid section' using errcode='23514'; end if;
  for v_section,v_ids in select key,value from jsonb_each(p_selections) loop
    if jsonb_typeof(v_ids)<>'array' or jsonb_array_length(v_ids)>12 then raise exception 'invalid selection' using errcode='23514';end if;
  end loop;
  select count(*),count(distinct selected_id) into v_selection_count,v_unique_count
    from jsonb_each(p_selections) entry cross join lateral jsonb_array_elements_text(entry.value) as selected(selected_id);
  if v_selection_count not between 1 and 20 or v_unique_count<>v_selection_count then raise exception 'invalid selection' using errcode='23514';end if;
  select id,version,idempotency_key into v_pack,v_version,v_existing_request from public.ready_packs where user_id=v_user and plan_id=p_plan_id and status='active' for update;
  if v_pack is not null and v_existing_request=p_idempotency_key then return query select v_pack,true;return;end if;
  if v_pack is null then
    begin
      insert into public.ready_packs(user_id,plan_id,title,pack_type,idempotency_key) values(v_user,p_plan_id,v_plan_title,p_pack_type,p_idempotency_key) returning id,version into v_pack,v_version;
    exception when unique_violation then
      select id,version,idempotency_key into v_pack,v_version,v_existing_request from public.ready_packs where user_id=v_user and plan_id=p_plan_id and status='active' for update;
      if v_pack is not null and v_existing_request=p_idempotency_key then return query select v_pack,true;return;end if;
      raise exception 'concurrent Ready Pack change' using errcode='40001';
    end;
  else
    if p_expected_version is null or p_expected_version<>v_version then raise exception 'stale Ready Pack' using errcode='40001'; end if;
    update public.ready_packs set title=v_plan_title,pack_type=p_pack_type,idempotency_key=p_idempotency_key,version=version+1,updated_at=now() where id=v_pack and user_id=v_user returning version into v_version;
  end if;
  foreach v_section in array v_sections loop
    insert into public.ready_pack_sections(user_id,ready_pack_id,name,position) values(v_user,v_pack,v_section,v_position)
    on conflict(ready_pack_id,user_id,name) do update set position=excluded.position,updated_at=now();v_position:=v_position+1;
  end loop;
  delete from public.ready_pack_items where ready_pack_id=v_pack and user_id=v_user;
  for v_section,v_ids in select key,value from jsonb_each(p_selections) loop
    for v_memory in select jsonb_array_elements_text(v_ids) loop
      if not exists(select 1 from public.plan_memories where plan_id=p_plan_id and user_id=v_user and memory_id=v_memory::uuid) then raise exception 'invalid memory' using errcode='23503';end if;
      insert into public.ready_pack_items(user_id,ready_pack_id,memory_id,section,relevance_reason,relevance_strength)
      values(v_user,v_pack,v_memory::uuid,v_section,'This saved item supports '||lower(v_section)||'.','strong');
    end loop;
  end loop;
  return query select v_pack,false;
end $$;

create or replace function public.update_owned_ready_pack_checklist(p_pack_id uuid,p_section text,p_reviewed boolean,p_expected_version integer)
returns table(pack_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_version integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501';end if;
  select version into v_version from public.ready_packs where id=p_pack_id and user_id=v_user for update;
  if not found then raise exception 'not found' using errcode='P0002';end if;
  if v_version<>p_expected_version then raise exception 'stale Ready Pack' using errcode='40001';end if;
  update public.ready_pack_sections set reviewed=p_reviewed,updated_at=now() where ready_pack_id=p_pack_id and user_id=v_user and name=p_section;
  if not found then raise exception 'invalid section' using errcode='23514';end if;
  update public.ready_packs set version=version+1,updated_at=now() where id=p_pack_id and user_id=v_user;
  return query select p_pack_id;
end $$;
revoke all on function public.confirm_owned_ready_pack(uuid,text,text,jsonb,jsonb,uuid,integer) from public,anon;
revoke all on function public.update_owned_ready_pack_checklist(uuid,text,boolean,integer) from public,anon;
grant execute on function public.confirm_owned_ready_pack(uuid,text,text,jsonb,jsonb,uuid,integer) to authenticated;
grant execute on function public.update_owned_ready_pack_checklist(uuid,text,boolean,integer) to authenticated;
