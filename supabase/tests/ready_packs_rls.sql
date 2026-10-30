-- Run only against an approved disposable Supabase/PostgreSQL project after applying migrations.
-- Create users A/B; verify anonymous reads/functions fail, A cannot inspect B's Plan or Pack,
-- cross-owner Plan/Memory references fail, stale versions roll back, and retry IDs return one Pack.
begin;
select has_table_privilege('authenticated','public.ready_packs','select') as authenticated_can_read;
select not has_table_privilege('authenticated','public.ready_packs','insert,update,delete') as authenticated_cannot_write_directly;
select relrowsecurity and relforcerowsecurity from pg_class where oid='public.ready_packs'::regclass;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.memories(id,user_id,title,source_type,raw_text) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Lagos hotel','text','Lagos hotel stay'),
 ('12121212-1212-4121-8121-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unattached','text','Lagos cafe'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B hotel','text','B only');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select * from public.create_owned_plan('Lagos travel','Prepare trip',null,null,array['11111111-1111-4111-8111-111111111111']::uuid[],'33333333-3333-4333-8333-333333333333');
do $$ begin
  begin insert into public.ready_packs(user_id,plan_id,title,pack_type,idempotency_key) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select id from public.plans),'forged','travel',gen_random_uuid()); raise exception 'direct Ready Pack INSERT succeeded'; exception when insufficient_privilege then null; end;
  begin perform * from public.confirm_owned_ready_pack((select id from public.plans),'travel','forged title','{"Stay":["11111111-1111-4111-8111-111111111111"]}','{}','44444444-4444-4444-8444-444444444444',null); raise exception 'forged title succeeded'; exception when check_violation then null; end;
  begin perform * from public.confirm_owned_ready_pack((select id from public.plans),'event','Lagos travel','{"Stay":["11111111-1111-4111-8111-111111111111"]}','{}','44444444-4444-4444-8444-444444444444',null); raise exception 'forged pack type succeeded'; exception when check_violation then null; end;
  begin perform * from public.confirm_owned_ready_pack((select id from public.plans),'travel','Lagos travel','{}','{}','44444444-4444-4444-8444-444444444444',null); raise exception 'empty Ready Pack succeeded'; exception when check_violation then null; end;
  begin perform * from public.confirm_owned_ready_pack((select id from public.plans),'travel','Lagos travel','{"Stay":["12121212-1212-4121-8121-121212121212"]}','{}','44444444-4444-4444-8444-444444444444',null); raise exception 'unattached Memory succeeded'; exception when foreign_key_violation then null; end;
end $$;
select * from public.confirm_owned_ready_pack((select id from public.plans),'travel','Lagos travel','{"Stay":["11111111-1111-4111-8111-111111111111"]}','{}','44444444-4444-4444-8444-444444444444',null);
select * from public.confirm_owned_ready_pack((select id from public.plans),'travel','Lagos travel','{"Stay":["11111111-1111-4111-8111-111111111111"]}','{}','44444444-4444-4444-8444-444444444444',null);
do $$ declare v_pack uuid; begin
  if (select count(*) from public.ready_packs)<>1 or (select count(*) from public.ready_pack_items)<>1 then raise exception 'Ready Pack idempotency failed'; end if;
  select id into v_pack from public.ready_packs;
  perform * from public.update_owned_ready_pack_checklist(v_pack,'Stay',true,1);
  if not (select reviewed from public.ready_pack_sections where ready_pack_id=v_pack and name='Stay') then raise exception 'checklist persistence failed'; end if;
  begin perform * from public.update_owned_ready_pack_checklist(v_pack,'Stay',false,1); raise exception 'stale checklist update succeeded'; exception when serialization_failure then null; end;
end $$;
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin
  if exists(select 1 from public.ready_packs) then raise exception 'cross-owner Ready Pack SELECT leaked'; end if;
  begin perform * from public.update_owned_ready_pack_checklist((select id from public.ready_packs),'Stay',true,1); raise exception 'cross-owner checklist succeeded'; exception when sqlstate 'P0002' then null; end;
end $$;
reset role; set local role anon;
do $$ begin
  begin perform 1 from public.ready_packs; raise exception 'anonymous Ready Pack SELECT succeeded'; exception when insufficient_privilege then null; end;
  begin perform * from public.confirm_owned_ready_pack(gen_random_uuid(),'travel','x','{}','{}',gen_random_uuid(),null); raise exception 'anonymous Ready Pack RPC succeeded'; exception when insufficient_privilege then null; end;
end $$;
rollback;
