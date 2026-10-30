-- DO NOT run against production. Execute after the Stage 5 migration in a disposable database only.
-- The transaction rolls back. Fixed UUIDs are non-secret fixtures.
begin;
insert into auth.users(id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
insert into public.memories(user_id, title, source_type, raw_text) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A', 'text', 'Owned by A');

do $$
declare affected integer;
begin
  begin
    insert into public.memories(user_id, title, source_type, raw_text)
      values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'forged', 'text', 'forged');
    raise exception 'User A created a row owned by B';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
insert into public.memories(id, user_id, title, source_type, raw_text) values
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B', 'text', 'Owned by B');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

do $$
declare affected integer;
begin
  if (select count(*) from public.memories) <> 1 then raise exception 'Owner SELECT isolation failed'; end if;
  update public.memories set title = 'forbidden' where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner UPDATE succeeded'; end if;
  delete from public.memories where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner DELETE succeeded'; end if;
  begin
    update public.memories set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where title = 'A';
    raise exception 'Ownership update succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.memories;
    raise exception 'Anonymous SELECT succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.memories(user_id, title, source_type, raw_text)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anonymous', 'text', 'anonymous');
    raise exception 'Anonymous INSERT succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
