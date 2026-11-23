begin isolation level repeatable read read only;
select case when
  current_setting('server_version_num')::int / 10000 = 17
  and current_setting('default_transaction_read_only') = 'on'
  and current_user = 'dev_recovery_reader'
  and session_user = current_user
  and not (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
  and not exists (select from pg_auth_members where member = oid)
  and has_schema_privilege('public','USAGE')
  and not has_schema_privilege('public','CREATE')
  and to_regnamespace('auth') is not null and to_regnamespace('storage') is not null
  and not has_schema_privilege('auth','USAGE')
  and not has_schema_privilege('storage','USAGE')
  and to_regnamespace('supabase_migrations') is null
  and (select pg_get_userbyid(nspowner) = 'pg_database_owner' from pg_namespace where nspname = 'public')
  and not exists (select from pg_class where relnamespace = 'public'::regnamespace)
  and not exists (select from pg_proc where pronamespace = 'public'::regnamespace)
  and not exists (select from pg_type where typnamespace = 'public'::regnamespace)
  then pg_export_snapshot() end
from pg_roles where rolname = current_user;
