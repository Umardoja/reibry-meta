-- Stage 12B: proposal creation is server-controlled. This migration intentionally
-- invalidates confirmation of legacy/unattested proposals and removes the old RPC.
begin;

alter table public.action_proposals
  add column trusted_request_id uuid,
  add column trusted_item_index smallint,
  add column trust_source text not null default 'legacy-unverified',
  add constraint action_proposal_trust_state check (
    (trust_source = 'legacy-unverified' and trusted_request_id is null and trusted_item_index is null)
    or (trust_source = 'server-validated-meta' and trusted_request_id is not null and trusted_item_index between 0 and 2)
  );
create unique index action_proposals_trusted_request_idx
  on public.action_proposals(user_id, trusted_request_id, trusted_item_index)
  where trust_source = 'server-validated-meta';

revoke all on function public.create_action_proposals(jsonb, text) from public, anon, authenticated, service_role;
drop function public.create_action_proposals(jsonb, text);

create function public.create_trusted_action_proposals(
  p_user_id uuid, p_items jsonb, p_model_provenance text, p_request_id uuid
) returns setof public.action_proposals
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_index integer;
  v_memory_ids uuid[];
  v_proposal public.action_proposals%rowtype;
  v_existing integer;
begin
  if p_user_id is null or p_request_id is null
    or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 3
    or p_model_provenance <> 'meta:muse-spark-1.3'
    or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = 'P0004', message = 'invalid action state';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_id::text, 0));
  select count(*) into v_existing from public.action_proposals
    where user_id = p_user_id and trusted_request_id = p_request_id and trust_source = 'server-validated-meta';
  if v_existing > 0 and v_existing <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P0004', message = 'invalid action state';
  end if;
  for v_item, v_index in select value, ordinality - 1 from jsonb_array_elements(p_items) with ordinality loop
    if jsonb_typeof(v_item) <> 'object' or (v_item - 'title' - 'description' - 'supporting_memory_ids') <> '{}'::jsonb
      or jsonb_typeof(v_item->'title') <> 'string' or char_length(trim(v_item->>'title')) not between 1 and 100
      or jsonb_typeof(v_item->'description') <> 'string' or char_length(trim(v_item->>'description')) not between 1 and 400
      or jsonb_typeof(v_item->'supporting_memory_ids') <> 'array'
      or jsonb_array_length(v_item->'supporting_memory_ids') not between 1 and 6 then
      raise exception using errcode = 'P0004', message = 'invalid action state';
    end if;
    begin
      select array_agg(distinct value::uuid order by value::uuid) into v_memory_ids
        from jsonb_array_elements_text(v_item->'supporting_memory_ids');
    exception when invalid_text_representation then
      raise exception using errcode = 'P0004', message = 'invalid action state';
    end;
    if cardinality(v_memory_ids) <> jsonb_array_length(v_item->'supporting_memory_ids')
      or (select count(*) from public.memories where user_id = p_user_id and id = any(v_memory_ids)) <> cardinality(v_memory_ids) then
      raise exception using errcode = 'P0004', message = 'invalid action state';
    end if;
    if v_existing > 0 then
      select * into v_proposal from public.action_proposals
        where user_id = p_user_id and trusted_request_id = p_request_id and trusted_item_index = v_index
          and trust_source = 'server-validated-meta' and title = trim(v_item->>'title')
          and description = trim(v_item->>'description') and model_provenance = p_model_provenance;
      if not found or (select array_agg(memory_id order by memory_id) from public.action_proposal_memories
        where proposal_id = v_proposal.id and user_id = p_user_id) <> v_memory_ids then
        raise exception using errcode = 'P0004', message = 'invalid action state';
      end if;
      return next v_proposal;
    else
      insert into public.action_proposals(user_id, title, description, expires_at, model_provenance,
        trusted_request_id, trusted_item_index, trust_source)
        values (p_user_id, trim(v_item->>'title'), trim(v_item->>'description'), now() + interval '24 hours',
          p_model_provenance, p_request_id, v_index, 'server-validated-meta') returning * into v_proposal;
      insert into public.action_proposal_memories(proposal_id, user_id, memory_id)
        select v_proposal.id, p_user_id, unnest(v_memory_ids);
      return next v_proposal;
    end if;
  end loop;
end;
$$;

create or replace function public.confirm_action_proposal(p_proposal_id uuid)
returns setof public.action_cards
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_proposal public.action_proposals%rowtype; v_now timestamptz := now();
begin
  if v_user is null then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  select * into v_proposal from public.action_proposals where id = p_proposal_id and user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  if v_proposal.trust_source <> 'server-validated-meta' or v_proposal.trusted_request_id is null then
    raise exception using errcode = 'P0004', message = 'invalid action state';
  end if;
  if v_proposal.status = 'confirmed' then
    return query select * from public.action_cards where proposal_id = v_proposal.id and user_id = v_user;
    if not found then raise exception using errcode = 'P0004', message = 'invalid action state'; end if; return;
  end if;
  if v_proposal.status <> 'proposed' then raise exception using errcode = 'P0004', message = 'invalid action state'; end if;
  if v_proposal.expires_at <= v_now then raise exception using errcode = 'P0003', message = 'action expired'; end if;
  if not exists (select 1 from public.action_proposal_memories where proposal_id = v_proposal.id and user_id = v_user)
    or exists (select 1 from public.action_proposal_memories pm left join public.memories m
      on m.id = pm.memory_id and m.user_id = pm.user_id
      where pm.proposal_id = v_proposal.id and pm.user_id = v_user and m.id is null) then
    raise exception using errcode = 'P0004', message = 'invalid action state';
  end if;
  insert into public.action_cards(proposal_id, user_id, title, description, model_provenance, confirmed_at)
    values (v_proposal.id, v_user, v_proposal.title, v_proposal.description, v_proposal.model_provenance, v_now)
    on conflict (proposal_id) do nothing;
  update public.action_proposals set status = 'confirmed', confirmed_at = v_now
    where id = v_proposal.id and user_id = v_user and status = 'proposed';
  return query select * from public.action_cards where proposal_id = v_proposal.id and user_id = v_user;
end;
$$;

revoke all on function public.create_trusted_action_proposals(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.create_trusted_action_proposals(uuid, jsonb, text, uuid) to service_role;
revoke all on function public.confirm_action_proposal(uuid) from public, anon, service_role;
grant execute on function public.confirm_action_proposal(uuid) to authenticated;

commit;
