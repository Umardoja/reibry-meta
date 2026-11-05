-- Stage 12N-1: private iPhone Shortcut credentials. Apply only after separate
-- owner approval to the confirmed disposable development project.
-- Plaintext device credentials never enter this schema; only SHA-256 hex hashes do.
begin;

create table public.capture_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '180 days')
);

create table public.capture_device_requests (
  device_id uuid not null references public.capture_devices(id) on delete cascade,
  request_id uuid not null,
  memory_id uuid not null references public.memories(id) on delete restrict,
  duplicate boolean not null,
  created_at timestamptz not null default now(),
  primary key (device_id, request_id)
);

create index capture_devices_owner_active_idx on public.capture_devices(user_id, expires_at, created_at desc)
  where revoked_at is null;
create index capture_device_requests_rate_idx on public.capture_device_requests(device_id, created_at desc);

alter table public.capture_devices enable row level security;
alter table public.capture_devices force row level security;
alter table public.capture_device_requests enable row level security;
alter table public.capture_device_requests force row level security;
revoke all on table public.capture_devices, public.capture_device_requests from public, anon, authenticated;

create function public.create_capture_device(p_token_hash text, p_name text, p_expires_at timestamptz)
returns table(id uuid, name text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception using errcode = 'P0002', message = 'not found'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or char_length(trim(p_name)) not between 1 and 80
    or p_expires_at <= now() or p_expires_at > now() + interval '180 days' then
    raise exception using errcode = 'PT400', message = 'invalid device';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':capture-devices', 0));
  if (select count(*) from public.capture_devices d where d.user_id = v_user and d.revoked_at is null and d.expires_at > now()) >= 5 then
    raise exception using errcode = 'PT400', message = 'device limit';
  end if;
  return query insert into public.capture_devices(user_id, token_hash, name, expires_at)
    values (v_user, p_token_hash, trim(p_name), p_expires_at)
    returning capture_devices.id, capture_devices.name, capture_devices.created_at, capture_devices.expires_at, capture_devices.revoked_at, capture_devices.last_used_at;
end $$;

create function public.list_capture_devices()
returns table(id uuid, name text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select d.id, d.name, d.created_at, d.expires_at, d.revoked_at, d.last_used_at
  from public.capture_devices d where d.user_id = auth.uid()
  order by d.created_at desc, d.id desc
$$;

create function public.revoke_capture_device(p_device_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception using errcode = 'P0002', message = 'not found'; end if;
  update public.capture_devices set revoked_at = coalesce(revoked_at, now())
    where id = p_device_id and user_id = v_user;
  if not found then raise exception using errcode = 'P0002', message = 'not found'; end if;
  return true;
end $$;

-- Only the server-held secret role can invoke this function. It atomically
-- authenticates a hashed device credential, enforces request replay/rate limits,
-- and creates exactly the same link-Memory shape used by the existing capture service.
create function public.capture_from_device(
  p_token_hash text, p_request_id uuid, p_source_url text, p_title text, p_metadata jsonb, p_dedupe_key text
) returns table(memory jsonb, duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare v_device public.capture_devices%rowtype; v_memory public.memories%rowtype; v_replay_memory jsonb; v_duplicate boolean := false;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_request_id is null or p_dedupe_key !~ '^[0-9a-f]{64}$'
    or p_source_url !~ '^https://[^/@[:space:]]+(/|$)' or char_length(p_source_url) > 2048
    or char_length(trim(p_title)) not between 1 and 200 or jsonb_typeof(p_metadata) <> 'object' or octet_length(p_metadata::text) > 4096
    or (p_metadata - 'capture' - 'platform' - 'normalizedUrl' - 'format' - 'enrichment' - 'metadataProvider' - 'provenance' - 'postId' - 'author') <> '{}'::jsonb
    or not (p_metadata ? 'capture' and p_metadata ? 'platform' and p_metadata ? 'normalizedUrl' and p_metadata ? 'format' and p_metadata ? 'enrichment' and p_metadata ? 'metadataProvider' and p_metadata ? 'provenance')
    or p_metadata->>'capture' <> 'link' or p_metadata->>'normalizedUrl' !~ '^https://[^/@[:space:]]+(/|$)'
    or char_length(p_metadata->>'normalizedUrl') > 2048 or p_metadata->>'platform' not in ('youtube','tiktok','instagram','web')
    or p_metadata->>'format' not in ('video','short','photo','post','reel','page','profile') or p_metadata->>'enrichment' <> 'pending'
    or jsonb_typeof(p_metadata->'metadataProvider') <> 'null' or p_metadata->'provenance' is null or jsonb_typeof(p_metadata->'provenance') <> 'object'
    or p_metadata->'provenance'->>'title' <> 'reibry-placeholder'
    or (p_metadata ? 'postId' and (jsonb_typeof(p_metadata->'postId') <> 'string' or p_metadata->>'postId' !~ '^[A-Za-z0-9_-]{1,64}$'))
    or (p_metadata ? 'author' and (jsonb_typeof(p_metadata->'author') <> 'string' or char_length(p_metadata->>'author') not between 1 and 120 or p_metadata->'provenance'->>'author' <> 'url')) then
    raise exception using errcode = 'PT400', message = 'invalid capture';
  end if;
  select * into v_device from public.capture_devices where token_hash = p_token_hash for update;
  if not found then raise exception using errcode = 'P0002', message = 'not found'; end if;
  if v_device.revoked_at is not null or v_device.expires_at <= now() then raise exception using errcode = 'P0003', message = 'not found'; end if;
  -- PL/pgSQL cannot assign a record target alongside another INTO target.
  -- Serialize the original stored row so a replay returns its exact Memory ID
  -- and the duplicate status recorded by the first request.
  select to_jsonb(m), r.duplicate into v_replay_memory, v_duplicate from public.capture_device_requests r join public.memories m on m.id = r.memory_id
    where r.device_id = v_device.id and r.request_id = p_request_id;
  if found then return query select v_replay_memory, v_duplicate; return; end if;
  -- SELECT INTO assigns NULLs when no replay row exists; a fresh capture is
  -- non-duplicate unless the owner-scoped dedupe insert below says otherwise.
  v_duplicate := false;
  if (select count(*) from public.capture_device_requests where device_id = v_device.id and created_at > now() - interval '1 minute') >= 12 then
    raise exception using errcode = 'PT429', message = 'rate limited';
  end if;
  insert into public.memories(user_id, title, source_type, source_url, raw_text, analysis_status, metadata, dedupe_key)
    values (v_device.user_id, trim(p_title), 'link', p_source_url, null, 'processing', p_metadata, p_dedupe_key)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning * into v_memory;
  if not found then
    select * into v_memory from public.memories where user_id = v_device.user_id and dedupe_key = p_dedupe_key;
    if not found then raise exception using errcode = 'P0004', message = 'capture state'; end if;
    v_duplicate := true;
  end if;
  insert into public.capture_device_requests(device_id, request_id, memory_id, duplicate)
    values (v_device.id, p_request_id, v_memory.id, v_duplicate);
  update public.capture_devices set last_used_at = now() where id = v_device.id;
  return query select to_jsonb(v_memory), v_duplicate;
end $$;

revoke all on function public.create_capture_device(text,text,timestamptz), public.list_capture_devices(), public.revoke_capture_device(uuid), public.capture_from_device(text,uuid,text,text,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.create_capture_device(text,text,timestamptz), public.list_capture_devices(), public.revoke_capture_device(uuid) to authenticated;
grant execute on function public.capture_from_device(text,uuid,text,text,jsonb,text) to service_role;

do $$
declare v_fn regprocedure;
begin
  foreach v_fn in array array[
    'public.create_capture_device(text,text,timestamptz)'::regprocedure,
    'public.list_capture_devices()'::regprocedure,
    'public.revoke_capture_device(uuid)'::regprocedure,
    'public.capture_from_device(text,uuid,text,text,jsonb,text)'::regprocedure
  ] loop
    if not (select prosecdef from pg_proc where oid = v_fn) or not exists (select 1 from pg_proc where oid = v_fn and proconfig::text like '%search_path=%') then
      raise exception 'capture device function lost security settings';
    end if;
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'capture device function is publicly callable';
    end if;
    if exists (
      select 1 from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
      where p.oid = v_fn and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'capture device function is callable by PUBLIC';
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.capture_from_device(text,uuid,text,text,jsonb,text)'::regprocedure, 'EXECUTE') then
    raise exception 'authenticated can call trusted capture';
  end if;
end $$;

commit;
