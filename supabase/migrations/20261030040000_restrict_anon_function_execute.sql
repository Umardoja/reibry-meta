-- Stage 12F-1: hosted Supabase default privileges grant EXECUTE on new public functions
-- directly to anon, so revoking only from PUBLIC left these callable anonymously.
-- authenticated and service_role grants are intentionally unchanged.
begin;

revoke execute on function public.create_owned_plan(text,text,timestamptz,uuid,uuid[],uuid) from public, anon;
revoke execute on function public.update_owned_plan(uuid,integer,text,boolean,text,boolean,timestamptz,boolean,text,uuid,boolean,uuid[]) from public, anon;
revoke execute on function public.delete_owned_plan(uuid) from public, anon;
revoke execute on function public.set_action_updated_at() from public, anon;
revoke execute on function public.set_life_updated_at() from public, anon;
revoke execute on function public.set_memory_updated_at() from public, anon;

do $$ begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then raise exception 'anon still has EXECUTE on a public function'; end if;
end $$;

commit;
