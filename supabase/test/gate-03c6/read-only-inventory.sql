-- Run through an independently verified allowlisted project connection.
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

-- One row even when the exact API function is missing. Count overloads separately.
with limiter as (
  select p.*
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'consume_api_rate_limit'
), exact as (
  select * from limiter where prokind = 'f' and pronargs = 3
    and proargtypes[0] = 'text'::regtype
    and proargtypes[1] = 'integer'::regtype
    and proargtypes[2] = 'integer'::regtype
)
select 'limiter_contract' as check_name,
       (select count(*) from limiter) as same_name_count,
       exact.oid is not null as exact_signature_exists,
       coalesce(exact.proargnames = array['p_key','p_limit','p_window_ms','allowed','remaining','reset_at']
                and pg_get_function_result(exact.oid) = 'TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone)', false)
         as exact_api_shape,
       coalesce(has_schema_privilege('service_role','public','USAGE')
                and has_function_privilege('service_role',exact.oid,'EXECUTE'), false) as service_role_callable,
       coalesce(has_function_privilege('anon',exact.oid,'EXECUTE')
                or has_function_privilege('authenticated',exact.oid,'EXECUTE'), false) as browser_execute_granted
from (values (1)) as probe(dummy) left join exact on true;

-- Catalog existence and the inspection role's access are separate observations.
with history as (
  select n.oid as schema_oid, c.oid as relation_oid
  from pg_namespace n join pg_class c on c.relnamespace = n.oid
  where n.nspname = 'supabase_migrations' and c.relname = 'schema_migrations'
    and c.relkind in ('r', 'p')
)
select 'migration_history' as check_name, exists(select from history) as history_exists,
       exists(select from history where has_schema_privilege(schema_oid,'USAGE')
                                     and has_table_privilege(relation_oid,'SELECT')) as history_readable
\gset
\echo :check_name :history_exists :history_readable
\if :history_readable
select coalesce(json_agg(version order by version), '[]'::json) as applied_versions
from supabase_migrations.schema_migrations;
\else
\echo Migration history is absent or unreadable. Establish the exact version prefix and schema compatibility before planning.
\endif
rollback;
