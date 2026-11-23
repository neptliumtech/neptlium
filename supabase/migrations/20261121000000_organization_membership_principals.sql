begin;

-- Fail before backfill if any required lock is busy. A retry must rerun the
-- entire transaction against fresh mapping evidence.
set local lock_timeout = '5s';
lock table public.organization_memberships in access exclusive mode nowait;
lock table public.identity_provider_subjects in access exclusive mode nowait;
lock table public.identity_principals in share mode nowait;

alter table public.organization_memberships
  add column principal_id uuid references public.identity_principals(id) on delete restrict;

-- Existing Clerk subjects require independently verified issuer evidence.
alter table public.identity_provider_subjects
  add column clerk_issuer text check (
    clerk_issuer is null or
    (provider = 'CLERK' and clerk_issuer ~ '^https://[a-z0-9.-]+$')
  );

create function public.bind_organization_membership_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapped_principal_id uuid;
  mapped_subject_status text;
  mapped_principal_status text;
  active_subject text;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'organization membership legacy user is immutable';
    end if;
    if old.principal_id is not null then
      if new.principal_id is distinct from old.principal_id then
        raise exception 'organization membership principal conflicts with Supabase Auth mapping';
      end if;
      return new;
    end if;
  end if;

  select subject.principal_id, subject.status, principal.status
    into strict mapped_principal_id, mapped_subject_status, mapped_principal_status
  from public.identity_provider_subjects subject
  join public.identity_principals principal on principal.id = subject.principal_id
  where subject.provider = 'SUPABASE_AUTH'
    and subject.provider_subject = new.user_id::text
  for share of subject, principal nowait;

  if mapped_subject_status <> 'ACTIVE' or mapped_principal_status <> 'ACTIVE' then
    raise no_data_found;
  end if;

  select subject.provider_subject into strict active_subject
  from public.identity_provider_subjects subject
  where subject.principal_id = mapped_principal_id
    and subject.provider = 'SUPABASE_AUTH'
    and subject.status = 'ACTIVE'
  for share of subject nowait;

  if active_subject is distinct from new.user_id::text
     or (new.principal_id is not null and new.principal_id is distinct from mapped_principal_id) then
    raise exception 'organization membership principal conflicts with Supabase Auth mapping';
  end if;

  new.principal_id := mapped_principal_id;
  return new;
exception
  when no_data_found or too_many_rows then
    raise exception 'organization membership requires exactly one active Supabase Auth mapping to an active principal';
end;
$$;

revoke all on function public.bind_organization_membership_principal()
  from public, anon, authenticated, service_role;

-- Legacy inserts supply user_id. Lifecycle-only updates can continue after an
-- identity is revoked, so operators can still suspend or revoke the membership.
create trigger bind_organization_membership_principal
  before insert or update of user_id, principal_id on public.organization_memberships
  for each row execute function public.bind_organization_membership_principal();

update public.organization_memberships set principal_id = null;

alter table public.organization_memberships
  alter column principal_id set not null,
  add constraint organization_memberships_organization_principal_unique
    unique (organization_id, principal_id);

alter table public.organization_memberships enable row level security;
revoke all on table public.organization_memberships from public, anon, authenticated, service_role;
grant select, insert, update on table public.organization_memberships to service_role;

create function public.resolve_clerk_tenant_principal(
  p_issuer text, p_subject text, p_organization_id uuid
) returns uuid
language sql stable security invoker
set search_path = ''
as $$
  select principal.id
  from public.identity_provider_subjects subject
  join public.identity_principals principal on principal.id = subject.principal_id
  join public.organization_memberships membership on membership.principal_id = principal.id
  where subject.provider = 'CLERK'
    and subject.provider_subject = p_subject
    and subject.clerk_issuer = p_issuer
    and subject.status = 'ACTIVE' and subject.revoked_at is null
    and principal.status = 'ACTIVE' and principal.suspended_at is null and principal.retired_at is null
    and membership.organization_id = p_organization_id
    and membership.status = 'active' and membership.suspended_at is null and membership.revoked_at is null;
$$;

revoke all on function public.resolve_clerk_tenant_principal(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_clerk_tenant_principal(text, text, uuid) to service_role;

commit;
