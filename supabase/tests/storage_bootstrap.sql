-- LOCAL/DISPOSABLE PostgreSQL only: the minimal shape of Supabase Storage that migrations and policies touch (buckets, objects with RLS,
-- storage.foldername). Hosted projects already have the real schema and must never run this file. Run after disposable_bootstrap.sql.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null unique, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable set search_path = ''
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on table storage.objects to anon, authenticated, service_role;
grant select on table storage.buckets to anon, authenticated, service_role;
grant all on table storage.buckets, storage.objects to service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
-- Ownership matches hosted (supabase_storage_admin). This local cluster runs migrations as a superuser, so it CANNOT reproduce the hosted
-- rule that the migration role may not create policies on storage.objects; that was verified read-only on the hosted project instead.
do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin noinherit; end if; end $$;
alter table storage.objects owner to supabase_storage_admin;
