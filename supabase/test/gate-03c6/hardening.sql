begin;

do $$
declare
  revoked_subject constant uuid := '00000000-0000-4000-8000-000000000066';
  conflicting_subject constant uuid := '00000000-0000-4000-8000-000000000067';
  suspended_subject constant uuid := '00000000-0000-4000-8000-000000000068';
  other_principal constant uuid := '00000000-0000-4000-8000-000000000069';
  new_subject constant uuid := '00000000-0000-4000-8000-000000000070';
  existing_subject constant uuid := '00000000-0000-4000-8000-000000000071';
  existing_link uuid;
  forbidden text;
  denied_subject uuid;
begin
  insert into public.identity_principals (id) values (revoked_subject), (other_principal);
  insert into public.identity_principals (id, status, suspended_at) values (suspended_subject, 'SUSPENDED', now());
  insert into public.identity_provider_subjects (principal_id, provider, provider_subject, status, revoked_at)
    values (revoked_subject, 'SUPABASE_AUTH', revoked_subject::text, 'REVOKED', now()),
           (other_principal, 'SUPABASE_AUTH', conflicting_subject::text, 'ACTIVE', null);
  foreach denied_subject in array array[revoked_subject, conflicting_subject, suspended_subject] loop
    begin
      insert into auth.users(id, email) values (denied_subject, denied_subject::text || '@example.invalid');
      raise exception 'Auth insertion accepted an ineligible existing identity';
    exception when check_violation then
      if sqlerrm <> 'Supabase Auth identity continuity conflict' then raise; end if;
    end;
  end loop;
  if exists (select from public.profiles where id in (revoked_subject, conflicting_subject, suspended_subject))
    or exists (select from public.identity_principals where id = conflicting_subject)
    or exists (select from public.identity_provider_subjects where principal_id = suspended_subject)
    or not exists (select from public.identity_provider_subjects where principal_id = revoked_subject and status = 'REVOKED')
    or not exists (select from public.identity_provider_subjects where principal_id = other_principal and provider_subject = conflicting_subject::text) then
    raise exception 'failed identity bootstrap did not preserve original state';
  end if;

  insert into public.identity_principals(id) values (existing_subject);
  insert into public.identity_provider_subjects (principal_id, provider, provider_subject)
    values (existing_subject, 'SUPABASE_AUTH', existing_subject::text) returning id into existing_link;
  insert into auth.users(id, email) values
    (new_subject, 'gate03c6-new@example.invalid'), (existing_subject, 'gate03c6-existing@example.invalid');
  if (select count(*) from public.profiles where id in (new_subject, existing_subject)) <> 2
    or not exists (select from public.identity_provider_subjects where principal_id = new_subject
                   and provider = 'SUPABASE_AUTH' and provider_subject = new_subject::text and status = 'ACTIVE')
    or not exists (select from public.identity_provider_subjects where id = existing_link
                   and principal_id = existing_subject and status = 'ACTIVE') then
    raise exception 'Auth insertion did not create or preserve the expected identity';
  end if;

  foreach forbidden in array array['identity_principals','identity_provider_subjects','identity_events'] loop
    if not has_table_privilege('service_role','public.' || forbidden,'SELECT')
      or has_table_privilege('service_role','public.' || forbidden,'INSERT, UPDATE, DELETE, TRUNCATE')
      or not (select relrowsecurity from pg_class where oid = ('public.' || forbidden)::regclass) then
      raise exception 'unexpected service-role identity privileges on %', forbidden;
    end if;
  end loop;
  if has_table_privilege('service_role','public.api_rate_limits','SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
    or has_function_privilege('service_role','public.handle_new_user()','EXECUTE') then
    raise exception 'service_role has direct limiter or trigger access';
  end if;
end $$;

insert into public.api_rate_limits(key, window_started_at, request_count)
values (repeat('d', 64), clock_timestamp(), 2147483647);
set local role service_role;
do $$
begin
  begin
    perform public.consume_api_rate_limit(repeat('c', 64), null, 60000);
    raise exception 'limiter accepted a null limit';
  exception when raise_exception then
    if sqlerrm <> 'invalid rate-limit policy' then raise; end if;
  end;
  begin
    perform public.consume_api_rate_limit(repeat('c', 64), 1, null);
    raise exception 'limiter accepted a null duration';
  exception when raise_exception then
    if sqlerrm <> 'invalid rate-limit policy' then raise; end if;
  end;
  if (select allowed from public.consume_api_rate_limit(repeat('d', 64), 10000, 60000)) is distinct from false then
    raise exception 'saturated limiter counter no longer denies';
  end if;
end $$;
reset role;
rollback;
