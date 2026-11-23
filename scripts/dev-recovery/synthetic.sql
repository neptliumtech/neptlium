create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin;
create role supabase_admin nologin;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant select on tables to authenticated;

create table public.recovery_fixture (id integer generated always as identity primary key, visible boolean not null);
insert into public.recovery_fixture (visible) values (true), (false);
alter table public.recovery_fixture enable row level security;
grant select on public.recovery_fixture to authenticated;
create policy fixture_read on public.recovery_fixture for select to authenticated using (visible);

create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key);
insert into supabase_migrations.schema_migrations values ('fixture');

create schema auth;
create table auth.users (id integer);
insert into auth.users values (1);
create schema storage;
create table storage.objects (id integer);
insert into storage.objects values (1);
