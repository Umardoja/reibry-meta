-- Stage 12M (prepared only): permit explicitly labelled, server-written Supadata metadata in the existing trusted enrichment RPC.
-- This migration does not grant browser clients metadata writes or RPC execution. Do not apply until the owner separately approves
-- the disposable-development schema change and Supadata's provenance/rights gate is resolved for any public release.
begin;

create or replace function public.apply_trusted_link_enrichment(p_user_id uuid, p_memory_id uuid, p_details jsonb, p_title text)
returns setof public.memories
language plpgsql security definer set search_path = '' as $$
declare
  v_memory public.memories%rowtype;
  v_key text;
  v_value jsonb;
  v_provenance jsonb;
  v_old_provenance jsonb;
  v_title text;
  v_title_is_placeholder boolean;
  v_allowed constant text[] := array['enrichment','enrichmentReason','metadataProvider','author','authorUrl','caption','thumbnailUrl',
    'publishedAt','durationSeconds','siteName','canonicalUrl','postId','hashtags','provenance','enrichedAt'];
  v_sources constant text[] := array['user','url','youtube-oembed','tiktok-oembed','page-metadata','supadata-unverified','reibry-placeholder'];
begin
  if p_user_id is null or p_memory_id is null or p_details is null or jsonb_typeof(p_details) <> 'object'
    or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'invalid enrichment request' using errcode = 'PT400';
  end if;
  select * into v_memory from public.memories where id = p_memory_id and user_id = p_user_id and source_type = 'link' for update;
  if not found then raise exception 'memory not found' using errcode = 'P0002'; end if;

  for v_key, v_value in select key, value from jsonb_each(p_details) loop
    if not (v_key = any(v_allowed)) then raise exception 'unsupported enrichment field' using errcode = 'PT400'; end if;
    if v_key = 'enrichment' and not (jsonb_typeof(v_value) = 'string' and v_value #>> '{}' in ('complete','partial','unavailable','timed-out','pending')) then
      raise exception 'invalid enrichment status' using errcode = 'PT400'; end if;
    if v_key = 'metadataProvider' and not (jsonb_typeof(v_value) = 'null' or v_value #>> '{}' in ('youtube-oembed','tiktok-oembed','page-metadata','supadata-unverified')) then
      raise exception 'invalid provider' using errcode = 'PT400'; end if;
    if v_key = 'enrichmentReason' and not (jsonb_typeof(v_value) = 'string' and v_value #>> '{}' ~ '^[a-z][a-z-]{1,63}$') then
      raise exception 'invalid reason' using errcode = 'PT400'; end if;
    if v_key in ('author','siteName') and not (jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') between 1 and 120) then
      raise exception 'invalid text field' using errcode = 'PT400'; end if;
    if v_key = 'caption' and not (jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') between 1 and 1000) then
      raise exception 'invalid caption' using errcode = 'PT400'; end if;
    if v_key in ('authorUrl','thumbnailUrl','canonicalUrl') and not (jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') <= 2048
      and v_value #>> '{}' ~ '^https://[^/@\s]+(/|$)' and v_value #>> '{}' !~ '\s') then
      raise exception 'invalid url' using errcode = 'PT400'; end if;
    if v_key = 'postId' and not (jsonb_typeof(v_value) = 'string' and v_value #>> '{}' ~ '^[A-Za-z0-9_-]{1,64}$') then
      raise exception 'invalid post id' using errcode = 'PT400'; end if;
    if v_key = 'durationSeconds' and not (jsonb_typeof(v_value) = 'number' and (v_value #>> '{}')::numeric between 1 and 86400 and (v_value #>> '{}')::numeric = trunc((v_value #>> '{}')::numeric)) then
      raise exception 'invalid duration' using errcode = 'PT400'; end if;
    if v_key in ('publishedAt','enrichedAt') then
      begin
        if jsonb_typeof(v_value) <> 'string' or char_length(v_value #>> '{}') > 40 then raise exception 'invalid date' using errcode = 'PT400'; end if;
        perform (v_value #>> '{}')::timestamptz;
      exception when invalid_datetime_format or datetime_field_overflow then raise exception 'invalid date' using errcode = 'PT400';
      end;
    end if;
    if v_key = 'hashtags' and not (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) <= 10
      and not exists (select 1 from jsonb_array_elements(v_value) tag where jsonb_typeof(tag) <> 'string' or tag #>> '{}' !~ '^[[:alnum:]_]{2,40}$')) then
      raise exception 'invalid hashtags' using errcode = 'PT400'; end if;
    if v_key = 'provenance' and not (jsonb_typeof(v_value) = 'object' and not exists (select 1 from jsonb_each(v_value) item
      where item.key not in ('title','author','caption','thumbnailUrl','publishedAt','durationSeconds','siteName')
         or jsonb_typeof(item.value) <> 'string' or not (item.value #>> '{}' = any(v_sources)) or item.value #>> '{}' = 'user')) then
      raise exception 'invalid provenance' using errcode = 'PT400'; end if;
  end loop;

  v_old_provenance := case when jsonb_typeof(v_memory.metadata -> 'provenance') = 'object' then v_memory.metadata -> 'provenance' else null end;
  v_title_is_placeholder := coalesce(v_old_provenance ->> 'title' = 'reibry-placeholder',
    v_old_provenance is null and v_memory.title = split_part(regexp_replace(coalesce(v_memory.source_url, ''), '^https?://', ''), '/', 1));
  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is not null and char_length(v_title) > 200 then raise exception 'invalid title' using errcode = 'PT400'; end if;
  v_provenance := coalesce(v_old_provenance, '{}'::jsonb) || (coalesce(p_details -> 'provenance', '{}'::jsonb) - 'title' - 'note');
  if v_title is not null and v_title_is_placeholder and p_details -> 'provenance' ? 'title' then
    v_provenance := v_provenance || jsonb_build_object('title', p_details -> 'provenance' -> 'title');
  end if;

  update public.memories set
    metadata = (v_memory.metadata || (p_details - 'provenance')) || jsonb_build_object('provenance', v_provenance),
    title = case when v_title is not null and v_title_is_placeholder and p_details -> 'provenance' ? 'title' then v_title else title end
  where id = p_memory_id and user_id = p_user_id
  returning * into v_memory;
  return next v_memory;
end $$;

revoke all on function public.apply_trusted_link_enrichment(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_trusted_link_enrichment(uuid, uuid, jsonb, text) to service_role;

do $$
declare v_fn regprocedure := 'public.apply_trusted_link_enrichment(uuid,uuid,jsonb,text)'::regprocedure;
begin
  if not (select prosecdef from pg_proc where oid = v_fn) then raise exception 'enrichment function must be SECURITY DEFINER'; end if;
  if not exists (select 1 from pg_proc where oid = v_fn and proconfig::text like '%search_path=%') then raise exception 'enrichment function lost search_path'; end if;
  if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then raise exception 'enrichment function is client-callable'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = v_fn and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'PUBLIC can execute the enrichment function'; end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE') then raise exception 'service_role cannot execute the enrichment function'; end if;
  if has_column_privilege('authenticated', 'public.memories', 'metadata', 'UPDATE') then raise exception 'authenticated gained metadata UPDATE'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'anon can execute a public function'; end if;
end $$;

commit;
