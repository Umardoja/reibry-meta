-- DO NOT run against production. Execute after all Stage 5/6/9 migrations in a disposable database only.
-- Two-user ownership, direct-write denial and idempotent confirmation plan. Entire fixture rolls back.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.memories(id,user_id,title,source_type,raw_text) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A evidence','text','A only'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B evidence','text','B only');

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);

do $$ begin
  begin insert into public.action_proposals(user_id,title,description,expires_at,model_provenance)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','forged','direct write',now()+interval '1 hour','meta:muse-spark-1.3');
    raise exception 'Direct proposal INSERT succeeded'; exception when insufficient_privilege then null; end;
  begin update public.action_proposals set status='confirmed'; raise exception 'Direct status UPDATE succeeded';
    exception when insufficient_privilege then null; end;
end $$;

select * from public.create_action_proposals('[{"title":"Review A","description":"Use A evidence","supporting_memory_ids":["11111111-1111-4111-8111-111111111111"]}]','meta:muse-spark-1.3');
do $$ begin
  begin perform * from public.create_action_proposals('[{"title":"Forge B","description":"Use B evidence","supporting_memory_ids":["22222222-2222-4222-8222-222222222222"]}]','meta:muse-spark-1.3');
    raise exception 'Cross-owner Memory proposal succeeded'; exception when sqlstate 'P0004' then null; end;
end $$;

select * from public.confirm_action_proposal((select id from public.action_proposals where title='Review A'));
select * from public.confirm_action_proposal((select id from public.action_proposals where title='Review A'));
do $$ begin
  if (select count(*) from public.action_cards) <> 1 then raise exception 'Duplicate confirmation created multiple cards'; end if;
  if exists (select 1 from public.action_cards where status <> 'confirmed') then raise exception 'Invalid card status'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
do $$ begin
  if exists (select 1 from public.action_proposals) or exists (select 1 from public.action_cards) then raise exception 'Cross-owner SELECT leaked Actions'; end if;
  begin perform * from public.confirm_action_proposal((select id from public.action_proposals));
    raise exception 'Cross-owner confirmation succeeded'; exception when sqlstate 'P0002' then null; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select * from public.create_action_proposals('[{"title":"Expiring A","description":"Use A evidence","supporting_memory_ids":["11111111-1111-4111-8111-111111111111"]}]','meta:muse-spark-1.3');
reset role;
update public.action_proposals set expires_at = now() - interval '1 minute' where title='Expiring A';
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ begin
  begin perform * from public.confirm_action_proposal((select id from public.action_proposals where title='Expiring A'));
    raise exception 'Expired proposal confirmation succeeded'; exception when sqlstate 'P0003' then null; end;
end $$;
rollback;
