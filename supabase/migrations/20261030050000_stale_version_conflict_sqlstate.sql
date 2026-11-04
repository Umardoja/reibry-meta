-- Stage 12F-3: stale-version and competing-confirmation business conflicts used SQLSTATE 40001.
-- PostgREST treats 40001 as a retryable serialization failure and re-runs the transaction, which raises
-- 40001 again, so stale updates hung instead of failing. PT409 makes PostgREST answer HTTP 409 at once.
-- Bodies are unchanged from 20261030010000/20261030020000 except the SQLSTATE. CREATE OR REPLACE keeps
-- each function's owner, ACL, SECURITY DEFINER flag and search_path; the guard below asserts that.
begin;

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
  if v_current.version <> p_expected_version then raise exception using errcode = 'PT409'; end if;
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
  if p_memory_ids is not null then delete from public.plan_memories as pm where pm.plan_id = p_plan_id and pm.user_id = v_user; insert into public.plan_memories(plan_id,user_id,memory_id) select p_plan_id,v_user,value from unnest(p_memory_ids) value; end if;
  return query select p_plan_id;
end $$;

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
      raise exception 'concurrent Ready Pack change' using errcode='PT409';
    end;
  else
    if p_expected_version is null or p_expected_version<>v_version then raise exception 'stale Ready Pack' using errcode='PT409'; end if;
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
  if v_version<>p_expected_version then raise exception 'stale Ready Pack' using errcode='PT409';end if;
  update public.ready_pack_sections set reviewed=p_reviewed,updated_at=now() where ready_pack_id=p_pack_id and user_id=v_user and name=p_section;
  if not found then raise exception 'invalid section' using errcode='23514';end if;
  update public.ready_packs set version=version+1,updated_at=now() where id=p_pack_id and user_id=v_user;
  return query select p_pack_id;
end $$;

do $$
declare v_fn regprocedure;
begin
  foreach v_fn in array array[
    'public.update_owned_plan(uuid,integer,text,boolean,text,boolean,timestamptz,boolean,text,uuid,boolean,uuid[])'::regprocedure,
    'public.confirm_owned_ready_pack(uuid,text,text,jsonb,jsonb,uuid,integer)'::regprocedure,
    'public.update_owned_ready_pack_checklist(uuid,text,boolean,integer)'::regprocedure] loop
    if not (select prosecdef from pg_proc where oid = v_fn) then raise exception '% lost SECURITY DEFINER', v_fn; end if;
    if not exists (select 1 from pg_proc where oid = v_fn and proconfig::text like '%search_path=%') then raise exception '% lost search_path', v_fn; end if;
    if (select prosrc from pg_proc where oid = v_fn) ~ '40001' then raise exception '% still raises 40001', v_fn; end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE') then raise exception 'anon can execute %', v_fn; end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then raise exception 'authenticated lost EXECUTE on %', v_fn; end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = v_fn and a.grantee = 0 and a.privilege_type = 'EXECUTE') then raise exception 'PUBLIC can execute %', v_fn; end if;
  end loop;
end $$;

commit;
