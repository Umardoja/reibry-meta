-- Stage 12N-1 disposable-only verification. Run after all migrations in a
-- rollback-capable local database; never execute against production by default.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbaaaaaaa');

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
create temporary table test_device as select * from public.create_capture_device(repeat('a',64), 'Test iPhone', now() + interval '7 days');
do $$ begin
  if (select count(*) from test_device) <> 1 then raise exception 'device was not issued'; end if;
  begin select token_hash from public.capture_devices; raise exception 'authenticated read device hashes'; exception when insufficient_privilege then null; end;
  begin perform public.capture_from_device(repeat('a',64), gen_random_uuid(), 'https://www.tiktok.com/@baker/video/7311223344556677889', 'TikTok video', '{}'::jsonb, repeat('b',64)); raise exception 'authenticated called trusted capture'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform public.create_capture_device(repeat('b',64), 'forged', now() + interval '7 days'); raise exception 'anon issued a device'; exception when insufficient_privilege then null; end;
  begin perform public.capture_from_device(repeat('a',64), gen_random_uuid(), 'https://www.tiktok.com/@baker/video/7311223344556677889', 'TikTok video', '{}'::jsonb, repeat('b',64)); raise exception 'anon called trusted capture'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
do $$
declare v_device uuid := (select id from test_device); v_first record; v_retry record;
begin
  select * into v_first from public.capture_from_device(repeat('a',64), '50000000-0000-4000-8000-000000000001',
    'https://www.tiktok.com/@baker/video/7311223344556677889', 'TikTok video',
    '{"capture":"link","platform":"tiktok","normalizedUrl":"https://www.tiktok.com/@baker/video/7311223344556677889","format":"video","enrichment":"pending","metadataProvider":null,"postId":"7311223344556677889","author":"@baker","provenance":{"title":"reibry-placeholder","author":"url"}}', repeat('c',64));
  select * into v_retry from public.capture_from_device(repeat('a',64), '50000000-0000-4000-8000-000000000001',
    'https://www.tiktok.com/@baker/video/7311223344556677889', 'TikTok video',
    '{"capture":"link","platform":"tiktok","normalizedUrl":"https://www.tiktok.com/@baker/video/7311223344556677889","format":"video","enrichment":"pending","metadataProvider":null,"postId":"7311223344556677889","author":"@baker","provenance":{"title":"reibry-placeholder","author":"url"}}', repeat('c',64));
  if v_first.duplicate or not v_retry.duplicate or v_first.memory->>'id' <> v_retry.memory->>'id' then raise exception 'request replay was not idempotent'; end if;
  if (select user_id::text from public.memories where id = (v_first.memory->>'id')::uuid) <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then raise exception 'capture ownership changed'; end if;
  update public.capture_devices set revoked_at = now() where id = v_device;
  begin perform public.capture_from_device(repeat('a',64), gen_random_uuid(), 'https://www.tiktok.com/@baker/video/7311223344556677889', 'TikTok video',
    '{"capture":"link","platform":"tiktok","normalizedUrl":"https://www.tiktok.com/@baker/video/7311223344556677889","format":"video","enrichment":"pending","metadataProvider":null,"postId":"7311223344556677889","author":"@baker","provenance":{"title":"reibry-placeholder","author":"url"}}', repeat('d',64)); raise exception 'revoked credential captured'; exception when sqlstate 'P0003' then null; end;
end $$;
reset role;
rollback;
