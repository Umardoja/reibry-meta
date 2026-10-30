-- Disposable two-user verification plan. Run only in an approved isolated Supabase project; always rolls back.
begin;
-- Seed auth User A/User B, one Life context and two Memories per owner using an administrator fixture.
-- SET LOCAL request.jwt.claim.sub to User A and assert direct INSERT/UPDATE/DELETE on plans and plan_memories is denied.
-- As User A call create_owned_plan with User A references: succeeds; retry same idempotency key returns the same ID.
-- As User A call create/update with User B Memory or Life IDs: fails without disclosing their contents.
-- As User B SELECT User A's Plan, then update/delete its ID through RPC: no row / not found.
-- Exercise stale expected_version and concurrent updates: exactly one succeeds and the other receives serialization conflict.
-- Force a bad reference during update and verify Plan fields and plan_memories both roll back.
-- Anonymous SELECT and function execution must be denied.
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.memories(id,user_id,title,source_type,raw_text) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A Memory','text','A only'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B Memory','text','B only');
insert into public.life_contexts(id,user_id,type,title) values
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','trip','A Trip'),
 ('44444444-4444-4444-8444-444444444444','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','event','B Event');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
  begin insert into public.plans(user_id,title,idempotency_key) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','forged',gen_random_uuid()); raise exception 'direct Plan INSERT succeeded'; exception when insufficient_privilege then null; end;
end $$;
select * from public.create_owned_plan('A travel Plan','Prepare Lagos',null,'33333333-3333-4333-8333-333333333333',array['11111111-1111-4111-8111-111111111111']::uuid[],'55555555-5555-4555-8555-555555555555');
select * from public.create_owned_plan('A travel Plan','Prepare Lagos',null,'33333333-3333-4333-8333-333333333333',array['11111111-1111-4111-8111-111111111111']::uuid[],'55555555-5555-4555-8555-555555555555');
do $$ begin
  if (select count(*) from public.plans where title='A travel Plan')<>1 then raise exception 'Plan idempotency failed'; end if;
  if (select count(*) from public.plan_memories)<>1 then raise exception 'Plan Memory idempotency failed'; end if;
  begin perform * from public.create_owned_plan('Cross owner',null,null,null,array['22222222-2222-4222-8222-222222222222']::uuid[],'66666666-6666-4666-8666-666666666666'); raise exception 'cross-owner Memory Plan succeeded'; exception when foreign_key_violation then null; end;
  begin perform * from public.update_owned_plan((select id from public.plans where title='A travel Plan'),1,null,false,null,false,null,false,null,'44444444-4444-4444-8444-444444444444',true,null); raise exception 'cross-owner Life update succeeded'; exception when foreign_key_violation then null; end;
  if (select version from public.plans where title='A travel Plan')<>1 then raise exception 'failed update was not rolled back'; end if;
  begin perform * from public.update_owned_plan((select id from public.plans where title='A travel Plan'),2,'stale',true,null,false,null,false,null,null,false,null); raise exception 'stale update succeeded'; exception when serialization_failure then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin
  if exists(select 1 from public.plans) then raise exception 'cross-owner Plan SELECT leaked'; end if;
  begin perform * from public.update_owned_plan((select id from public.plans where title='A travel Plan'),1,'forged',true,null,false,null,false,null,null,false,null); raise exception 'cross-owner Plan update succeeded'; exception when sqlstate 'P0002' then null; end;
end $$;
reset role; set local role anon;
do $$ begin
  begin perform 1 from public.plans; raise exception 'anonymous Plan SELECT succeeded'; exception when insufficient_privilege then null; end;
  begin perform * from public.create_owned_plan('anon',null,null,null,'{}'::uuid[],gen_random_uuid()); raise exception 'anonymous Plan RPC succeeded'; exception when insufficient_privilege then null; end;
end $$;
rollback;
