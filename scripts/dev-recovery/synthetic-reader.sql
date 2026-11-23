create role dev_recovery_reader login noinherit;
alter role dev_recovery_reader in database postgres set default_transaction_read_only = on;
grant connect on database postgres to dev_recovery_reader;
grant usage on schema public to dev_recovery_reader;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_admin nologin;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant select on tables to authenticated;

create schema auth;
create schema storage;
