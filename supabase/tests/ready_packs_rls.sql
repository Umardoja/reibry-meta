-- Run only against an approved disposable Supabase/PostgreSQL project after applying migrations.
-- Create users A/B; verify anonymous reads/functions fail, A cannot inspect B's Plan or Pack,
-- cross-owner Plan/Memory references fail, stale versions roll back, and retry IDs return one Pack.
begin;
select has_table_privilege('authenticated','public.ready_packs','select') as authenticated_can_read;
select not has_table_privilege('authenticated','public.ready_packs','insert,update,delete') as authenticated_cannot_write_directly;
select relrowsecurity and relforcerowsecurity from pg_class where oid='public.ready_packs'::regclass;
rollback;
