-- Run through an independently verified approve-listed project connection.
-- psql flags: -X -v ON_ERROR_STOP=1. This inventory returns no customer rows or credentials.
begin isolation level repeatable read read only;
set local statement_timeout = '15s';

select current_setting('server_version') as server_version,
       current_setting('ssl') as server_ssl_enabled,
       coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as session_tls,
       current_setting('archive_mode') as archive_mode;

select n.nspname as schema_name,
       count(*) filter (where c.relkind in ('r','p','v','m','f','S')) as relation_count,
       count(*) filter (where c.relrowsecurity) as rls_enabled_count
from pg_namespace n left join pg_class c on c.relnamespace = n.oid
where n.nspname in ('public','auth','storage','supabase_migrations')
group by n.nspname order by n.nspname;

select extname, extversion from pg_extension order by extname;
select count(*) as public_function_count
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public';
select schemaname, tablename, policyname, roles, cmd
from pg_policies where schemaname = 'public' order by tablename, policyname;

select c.oid::regclass as relation, r.rolname as role,
       has_table_privilege(r.oid,c.oid,'SELECT') as can_read,
       has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as can_mutate
from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join pg_roles r
where c.relname in ('identity_principals','identity_provider_subjects','identity_events',
                    'organization_memberships','staged_clerk_production_links','api_rate_limits')
  and r.rolname in ('anon','authenticated','service_role')
order by c.relname, r.rolname;

select p.oid::regprocedure as function, r.rolname as role, p.prosecdef as security_definer,
       has_function_privilege(r.oid,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join pg_roles r
where p.proname in ('consume_api_rate_limit','handle_new_user','current_authenticated_principal_id',
                    'stage_clerk_production_continuity','revoke_staged_clerk_production_link',
                    'resolve_staged_clerk_production_tenant')
  and r.rolname in ('anon','authenticated','service_role')
order by p.oid::regprocedure::text, r.rolname;

select to_regclass('supabase_migrations.schema_migrations') is not null as has_history \gset
\if :has_history
select coalesce(json_agg(version order by version), '[]'::json) as applied_versions
from supabase_migrations.schema_migrations;
\else
\echo Migration history relation absent. Independently confirm public schema compatibility before planning.
\endif
rollback;
