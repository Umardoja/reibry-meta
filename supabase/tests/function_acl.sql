-- Function EXECUTE boundary. Run after hosted_default_privileges.sql so the harness reproduces
-- Supabase's default anon/authenticated/service_role function grants; always rolls back.
begin;
do $$
declare v_fn record;
begin
  for v_fn in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') loop
    raise exception 'anon can execute %', v_fn.sig;
  end loop;
  if has_function_privilege('authenticated', 'public.create_trusted_action_proposals(uuid,jsonb,text,uuid)', 'EXECUTE') then raise exception 'authenticated can create trusted proposals'; end if;
  if not has_function_privilege('service_role', 'public.create_trusted_action_proposals(uuid,jsonb,text,uuid)', 'EXECUTE') then raise exception 'service_role lost trusted proposal creation'; end if;
  if not (has_function_privilege('authenticated', 'public.create_owned_plan(text,text,timestamptz,uuid,uuid[],uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.update_owned_plan(uuid,integer,text,boolean,text,boolean,timestamptz,boolean,text,uuid,boolean,uuid[])', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.delete_owned_plan(uuid)', 'EXECUTE')) then raise exception 'authenticated lost Plan RPCs'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.create_owned_plan('anon',null,null,null,'{}'::uuid[],gen_random_uuid()); raise exception 'anonymous create_owned_plan executed'; exception when insufficient_privilege then null; end;
  begin perform * from public.update_owned_plan(gen_random_uuid(),1,'anon',true,null,false,null,false,null,null,false,null); raise exception 'anonymous update_owned_plan executed'; exception when insufficient_privilege then null; end;
  begin perform public.delete_owned_plan(gen_random_uuid()); raise exception 'anonymous delete_owned_plan executed'; exception when insufficient_privilege then null; end;
  begin perform public.set_action_updated_at(); raise exception 'anonymous set_action_updated_at executed'; exception when insufficient_privilege then null; end;
  begin perform public.set_life_updated_at(); raise exception 'anonymous set_life_updated_at executed'; exception when insufficient_privilege then null; end;
  begin perform public.set_memory_updated_at(); raise exception 'anonymous set_memory_updated_at executed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Updated-at triggers must still fire for owners after anon lost direct EXECUTE.
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.memories(id,user_id,title,source_type,raw_text,updated_at) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A Memory','text','A only','2000-01-01');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
update public.memories set title = 'A Memory edited' where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if (select updated_at from public.memories where id = '11111111-1111-4111-8111-111111111111') <= '2000-01-01' then raise exception 'updated_at trigger did not fire'; end if;
end $$;
rollback;
