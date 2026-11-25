begin;

-- The same rows must survive initial replay, upgrade, and recovery.
do $$
begin
  if (select count(*) from public.identity_provider_subjects
      where provider = 'SUPABASE_AUTH' and provider_subject = principal_id::text
        and status = 'ACTIVE' and principal_id in (
          '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062'
        )) <> 2 then
    raise exception 'fixture identities missing or rebound';
  end if;
  if not exists (
    select from public.ledger_accounts
    where id = '00000000-0000-4000-8000-000000000065'
      and owner_id = '00000000-0000-4000-8000-000000000061'
  ) or exists (select from public.ledger_postings) then
    raise exception 'fixture ownership changed or ledger was posted';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000061', true);
do $$
begin
  if public.current_authenticated_principal_id() is distinct from
     '00000000-0000-4000-8000-000000000061'::uuid then
    raise exception 'expected active principal';
  end if;
  if (select count(*) from public.organizations) <> 1
    or exists (select from public.organizations where name = 'Gate 03C.6 B') then
    raise exception 'organization RLS did not isolate the authenticated tenant';
  end if;
  begin
    perform 1 from public.organization_memberships;
    raise exception 'authenticated role can read private membership rows directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_api_rate_limit(repeat('a', 64), 1, 60000);
    raise exception 'authenticated role can call the limiter';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.identity_provider_subjects;
    raise exception 'anon can read private identity links';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_api_rate_limit(repeat('a', 64), 1, 60000);
    raise exception 'anon can call the limiter';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.identity_provider_subjects
set status = 'REVOKED', revoked_at = now()
where provider = 'SUPABASE_AUTH' and provider_subject = '00000000-0000-4000-8000-000000000061';
set local role authenticated;
do $$
begin
  if public.current_authenticated_principal_id() is not null then
    raise exception 'revoked identity still resolves';
  end if;
end $$;
reset role;

set local role service_role;
do $$
begin
  if (select allowed from public.consume_api_rate_limit(repeat('b', 64), 1, 60000)) is distinct from true
    or (select allowed from public.consume_api_rate_limit(repeat('b', 64), 1, 60000)) is distinct from false then
    raise exception 'limiter failed to enforce the shared budget';
  end if;
end $$;
reset role;

rollback;
