-- DO NOT run against production. Disposable database only; always rolls back.
begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
insert into public.life_contexts(user_id,type,title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','event','Owned by A');
do $$ begin begin insert into public.life_contexts(user_id,type,title) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','goal','forged'); raise exception 'forged owner insert succeeded'; exception when insufficient_privilege then null; end; end $$;
reset role;
insert into public.life_contexts(id,user_id,type,title) values ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','goal','Owned by B');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare affected integer; begin
  if (select count(*) from public.life_contexts)<>1 then raise exception 'Life SELECT isolation failed'; end if;
  update public.life_contexts set title='forbidden' where id='22222222-2222-4222-8222-222222222222'; get diagnostics affected=row_count; if affected<>0 then raise exception 'cross-owner update succeeded'; end if;
  delete from public.life_contexts where id='22222222-2222-4222-8222-222222222222'; get diagnostics affected=row_count; if affected<>0 then raise exception 'cross-owner delete succeeded'; end if;
  begin update public.life_contexts set user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where title='Owned by A'; raise exception 'owner reassignment succeeded'; exception when insufficient_privilege then null; end;
  begin insert into public.memory_context_matches(user_id,memory_id,life_context_id,similarity,reason) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333',(select id from public.life_contexts where title='Owned by A'),1,'forged match'); raise exception 'direct match write succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role; set local role anon;
do $$ begin begin perform 1 from public.life_contexts; raise exception 'anonymous Life SELECT succeeded'; exception when insufficient_privilege then null; end; end $$;
rollback;
