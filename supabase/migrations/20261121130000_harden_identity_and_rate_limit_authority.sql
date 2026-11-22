-- Forward-only. Supabase Auth remains the active identity provider.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.identity_principals (id, status)
  values (new.id, 'ACTIVE')
  on conflict (id) do nothing;

  insert into public.identity_provider_subjects (
    principal_id,
    provider,
    provider_subject,
    status
  )
  values (new.id, 'SUPABASE_AUTH', new.id::text, 'ACTIVE')
  on conflict (provider, provider_subject) do nothing;

  -- An Auth account insert cannot restore or transfer an existing identity.
  perform 1
  from public.identity_provider_subjects subject
  join public.identity_principals principal on principal.id = subject.principal_id
  where subject.provider = 'SUPABASE_AUTH'
    and subject.provider_subject = new.id::text
    and subject.principal_id = new.id
    and subject.status = 'ACTIVE'
    and subject.revoked_at is null
    and principal.status = 'ACTIVE'
    and principal.suspended_at is null
    and principal.retired_at is null
  for share of subject, principal;
  if not found then
    raise exception 'Supabase Auth identity continuity conflict' using errcode = '23514';
  end if;

  insert into public.profiles (id, email, full_name, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, profiles.email),
        first_name = coalesce(excluded.first_name, profiles.first_name),
        last_name = coalesce(excluded.last_name, profiles.last_name),
        full_name = case
          when profiles.full_name is null or profiles.full_name = '' then excluded.full_name
          else profiles.full_name
        end;

  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;

-- Supabase default privileges can otherwise give service_role direct DML.
revoke all on public.identity_principals, public.identity_provider_subjects,
  public.identity_events, public.api_rate_limits from public, anon, authenticated, service_role;
grant select on public.identity_principals, public.identity_provider_subjects,
  public.identity_events to service_role;

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
  if p_limit is null or p_window_ms is null
     or p_limit < 1 or p_limit > 10000 or p_window_ms < 1000 or p_window_ms > 3600000 then
    raise exception 'invalid rate-limit policy';
  end if;

  v_window := make_interval(secs => p_window_ms::double precision / 1000.0);
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  v_now := clock_timestamp();

  select request_count, window_started_at
    into v_count, v_started
    from public.api_rate_limits
    where key = p_key
    for update;

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

  -- All supported limits are at most 10000. Saturate the denied counter.
  v_count := least(v_count, 10000) + 1;
  update public.api_rate_limits
    set request_count = v_count, updated_at = v_now
    where key = p_key;
  return query select v_count <= p_limit, greatest(p_limit - v_count, 0), v_started + v_window;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;
