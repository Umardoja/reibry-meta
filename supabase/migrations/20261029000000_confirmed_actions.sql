-- REIBRY Meta Edition Stage 9. Apply only to a newly approved disposable project after Stages 5 and 6.
-- Proposals are inert; only confirm_action_proposal can create an Action Card. No external action is executed.
begin;

create table public.action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null check (char_length(trim(description)) between 1 and 400),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected', 'expired')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  model_provenance text not null check (char_length(model_provenance) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint action_proposal_confirmation_state check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  )
);

create table public.action_proposal_memories (
  proposal_id uuid not null,
  user_id uuid not null,
  memory_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, memory_id),
  foreign key (proposal_id, user_id) references public.action_proposals(id, user_id) on delete cascade,
  foreign key (memory_id, user_id) references public.memories(id, user_id) on delete restrict
);

create table public.action_cards (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique,
  user_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null check (char_length(trim(description)) between 1 and 400),
  status text not null default 'confirmed' check (status = 'confirmed'),
  model_provenance text not null check (char_length(model_provenance) between 1 and 100),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (proposal_id, user_id) references public.action_proposals(id, user_id) on delete restrict
);

create index action_proposals_owner_created_idx on public.action_proposals (user_id, created_at desc, id desc);
create index action_proposals_owner_status_expiry_idx on public.action_proposals (user_id, status, expires_at);
create index action_cards_owner_confirmed_idx on public.action_cards (user_id, confirmed_at desc, id desc);
create index action_proposal_memories_owner_idx on public.action_proposal_memories (user_id, proposal_id);

create function public.set_action_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function public.set_action_updated_at() from public;
create trigger set_action_proposal_updated_at before update on public.action_proposals
for each row execute function public.set_action_updated_at();
create trigger set_action_card_updated_at before update on public.action_cards
for each row execute function public.set_action_updated_at();

alter table public.action_proposals enable row level security;
alter table public.action_proposals force row level security;
alter table public.action_proposal_memories enable row level security;
alter table public.action_proposal_memories force row level security;
alter table public.action_cards enable row level security;
alter table public.action_cards force row level security;

revoke all on table public.action_proposals, public.action_proposal_memories, public.action_cards from public, anon, authenticated;
grant select on table public.action_proposals, public.action_proposal_memories, public.action_cards to authenticated;
create policy action_proposal_owner_select on public.action_proposals for select to authenticated using ((select auth.uid()) = user_id);
create policy action_proposal_memory_owner_select on public.action_proposal_memories for select to authenticated using ((select auth.uid()) = user_id);
create policy action_card_owner_select on public.action_cards for select to authenticated using ((select auth.uid()) = user_id);

create function public.create_action_proposals(p_items jsonb, p_model_provenance text)
returns setof public.action_proposals
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_memory_ids uuid[];
  v_proposal public.action_proposals%rowtype;
begin
  if v_user is null then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 3
    or p_model_provenance <> 'meta:muse-spark-1.3' then
    raise exception using errcode = 'P0004', message = 'invalid action state';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
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
      or (select count(*) from public.memories where user_id = v_user and id = any(v_memory_ids)) <> cardinality(v_memory_ids) then
      raise exception using errcode = 'P0004', message = 'invalid action state';
    end if;
    insert into public.action_proposals(user_id, title, description, expires_at, model_provenance)
      values (v_user, trim(v_item->>'title'), trim(v_item->>'description'), now() + interval '24 hours', p_model_provenance)
      returning * into v_proposal;
    insert into public.action_proposal_memories(proposal_id, user_id, memory_id)
      select v_proposal.id, v_user, unnest(v_memory_ids);
    return next v_proposal;
  end loop;
end;
$$;

create function public.confirm_action_proposal(p_proposal_id uuid)
returns setof public.action_cards
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_proposal public.action_proposals%rowtype;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  select * into v_proposal from public.action_proposals
    where id = p_proposal_id and user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  if v_proposal.status = 'confirmed' then
    return query select * from public.action_cards where proposal_id = v_proposal.id and user_id = v_user;
    if not found then raise exception using errcode = 'P0004', message = 'invalid action state'; end if;
    return;
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

create function public.reject_action_proposal(p_proposal_id uuid)
returns setof public.action_proposals
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_proposal public.action_proposals%rowtype;
begin
  if v_user is null then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  select * into v_proposal from public.action_proposals
    where id = p_proposal_id and user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'action not found'; end if;
  if v_proposal.status = 'rejected' then return next v_proposal; return; end if;
  if v_proposal.status <> 'proposed' then raise exception using errcode = 'P0004', message = 'invalid action state'; end if;
  if v_proposal.expires_at <= now() then raise exception using errcode = 'P0003', message = 'action expired'; end if;
  update public.action_proposals set status = 'rejected' where id = v_proposal.id and user_id = v_user returning * into v_proposal;
  return next v_proposal;
end;
$$;

revoke all on function public.create_action_proposals(jsonb, text), public.confirm_action_proposal(uuid), public.reject_action_proposal(uuid) from public, anon;
grant execute on function public.create_action_proposals(jsonb, text), public.confirm_action_proposal(uuid), public.reject_action_proposal(uuid) to authenticated;

commit;
