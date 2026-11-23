begin;

-- Resolve the reviewed Clerk binding and membership through the same principal.
-- The Supabase link is enrollment evidence. Retirement does not revoke Clerk.
drop function public.resolve_clerk_tenant_principal(text, text, uuid);

create or replace function public.resolve_staged_clerk_production_tenant(
  p_issuer text, p_subject text, p_organization_id uuid
) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(p.id))[1] end
  from public.staged_clerk_production_links l
  join public.identity_principals p on p.id = l.principal_id
  join public.organization_memberships m on m.principal_id = p.id
  where l.issuer = 'https://clerk.neptlium.com' and l.issuer = p_issuer
    and l.subject = p_subject and l.revoked_at is null
    and p.status = 'ACTIVE' and p.suspended_at is null and p.retired_at is null
    and m.organization_id = p_organization_id and m.status = 'active'
    and m.suspended_at is null and m.revoked_at is null;
$$;

revoke all on function public.resolve_staged_clerk_production_tenant(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_staged_clerk_production_tenant(text, text, uuid)
  to service_role;

-- A reviewed binding can only transition once, from linked to revoked.
create function public.guard_staged_clerk_production_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'staged Clerk links cannot be removed';
  end if;
  if old.revoked_at is not null or new.revoked_at is null
     or row(new.issuer, new.subject, new.principal_id, new.supabase_link_id,
            new.evidence_ref, new.linked_at)
        is distinct from
        row(old.issuer, old.subject, old.principal_id, old.supabase_link_id,
            old.evidence_ref, old.linked_at) then
    raise exception 'staged Clerk binding is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_staged_clerk_production_link()
  from public, anon, authenticated, service_role;

create trigger guard_staged_clerk_production_link
  before update or delete on public.staged_clerk_production_links
  for each row execute function public.guard_staged_clerk_production_link();

create trigger guard_staged_clerk_production_links_truncate
  before truncate on public.staged_clerk_production_links
  for each statement execute function public.guard_staged_clerk_production_link();

-- Existing memberships keep their tenant as well as their user and principal.
-- Column grants still allow existing lifecycle and role updates.
revoke update on public.organization_memberships from service_role;
grant update (role, status, suspended_at, revoked_at)
  on public.organization_memberships to service_role;

-- Restore the policy after Gate 03C.6 replaces the limiter function.
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms integer
) returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_window interval;
  v_count integer;
  v_started timestamptz;
begin
  if p_key is null or length(p_key) <> 64 or p_key !~ '^[0-9a-f]+$' then
    raise exception 'invalid rate-limit key';
  end if;
  if p_limit is null or p_window_ms is null or p_limit < 1 or p_limit > 10000 or p_window_ms < 1000 or p_window_ms > 3600000 then
    raise exception 'invalid rate-limit policy';
  end if;

  v_window := make_interval(secs => p_window_ms::double precision / 1000.0);
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  select request_count, window_started_at
    into v_count, v_started
    from public.api_rate_limits
    where key = p_key
    for update;

  v_now := clock_timestamp();

  if not found or v_started + v_window <= v_now then
    insert into public.api_rate_limits(key, window_started_at, request_count, updated_at)
      values (p_key, v_now, 1, v_now)
      on conflict (key) do update
        set window_started_at = excluded.window_started_at,
            request_count = 1,
            updated_at = excluded.updated_at;
    return query select true, p_limit - 1, v_now + v_window;
    return;
  end if;

  if v_count >= p_limit then
    return query select false, 0, v_started + v_window;
    return;
  end if;

  v_count := v_count + 1;
  update public.api_rate_limits
    set request_count = v_count, updated_at = v_now
    where key = p_key;
  return query select true, p_limit - v_count, v_started + v_window;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;

commit;
