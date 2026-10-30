-- LOCAL/DISPOSABLE harness only: reproduce hosted Supabase default privileges in public so
-- migrations are verified against the same implicit anon/authenticated/service_role grants.
-- Run after disposable_bootstrap.sql and before migrations, as the migration owner. Never run on hosted projects.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
