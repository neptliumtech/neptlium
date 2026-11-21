-- Staged repository foundation. Legacy Clerk rows are intentionally never imported.
create table public.staged_clerk_production_links (
  issuer text not null check (issuer = 'https://clerk.neptlium.com'),
  subject text not null check (subject ~ '^user_[A-Za-z0-9]{8,128}$'),
  principal_id uuid not null references public.identity_principals(id) on delete restrict,
  supabase_link_id uuid not null references public.identity_provider_subjects(id) on delete restrict,
  evidence_ref text not null check (length(btrim(evidence_ref)) between 1 and 255),
  linked_at timestamptz not null default now(),
  revoked_at timestamptz check (revoked_at >= linked_at),
  revocation_evidence_ref text,
  check (
    (revoked_at is null and revocation_evidence_ref is null)
    or (revoked_at is not null and revocation_evidence_ref is not null
        and length(btrim(revocation_evidence_ref)) between 1 and 255)
  ),
  primary key (issuer, subject),
  unique (issuer, principal_id),
  unique (issuer, supabase_link_id)
);

alter table public.staged_clerk_production_links enable row level security;
revoke all on public.staged_clerk_production_links from public, anon, authenticated, service_role;

-- Owner-only enrollment for externally reviewed proof of both immutable identities.
-- Exact retries return the original principal. Conflicts and revoked links deny.
create function public.stage_clerk_production_continuity(
  p_issuer text, p_subject text, p_supabase_user uuid, p_evidence_ref text
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  candidate record;
  resolved uuid;
begin
  select s.id, s.principal_id into strict candidate
  from public.identity_provider_subjects s
  join public.identity_principals p on p.id = s.principal_id
  where s.provider = 'SUPABASE_AUTH' and s.provider_subject = p_supabase_user::text
    and s.status = 'ACTIVE' and s.revoked_at is null
    and p.status = 'ACTIVE' and p.suspended_at is null and p.retired_at is null
  for share of s, p;

  insert into public.staged_clerk_production_links
    (issuer, subject, principal_id, supabase_link_id, evidence_ref)
  values (p_issuer, p_subject, candidate.principal_id, candidate.id, p_evidence_ref)
  on conflict (issuer, subject) do nothing;

  select principal_id into strict resolved
  from public.staged_clerk_production_links
  where issuer = p_issuer and subject = p_subject and principal_id = candidate.principal_id
    and supabase_link_id = candidate.id and evidence_ref = p_evidence_ref and revoked_at is null
  for share;
  return resolved;
end;
$$;

revoke all on function public.stage_clerk_production_continuity(text, text, uuid, text)
  from public, anon, authenticated, service_role;

create function public.revoke_staged_clerk_production_link(
  p_issuer text, p_subject text, p_evidence_ref text
) returns boolean
language sql
set search_path = ''
as $$
  with revoked as (
    update public.staged_clerk_production_links
    set revoked_at = statement_timestamp(), revocation_evidence_ref = p_evidence_ref
    where issuer = p_issuer and subject = p_subject and revoked_at is null
    returning subject
  )
  select exists (select 1 from revoked);
$$;

revoke all on function public.revoke_staged_clerk_production_link(text, text, text)
  from public, anon, authenticated, service_role;

-- Read the link, preserved principal, Supabase subject and tenant in one snapshot.
create function public.resolve_staged_clerk_production_tenant(
  p_issuer text, p_subject text, p_organization_id uuid
) returns uuid
language sql stable security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(p.id))[1] end
  from public.staged_clerk_production_links l
  join public.identity_principals p on p.id = l.principal_id
  join public.identity_provider_subjects s on s.id = l.supabase_link_id and s.principal_id = p.id
  join public.organization_memberships m on m.user_id::text = s.provider_subject
  where l.issuer = 'https://clerk.neptlium.com' and l.issuer = p_issuer
    and l.subject = p_subject and l.revoked_at is null
    and p.status = 'ACTIVE' and p.suspended_at is null and p.retired_at is null
    and s.provider = 'SUPABASE_AUTH' and s.status = 'ACTIVE' and s.revoked_at is null
    and m.organization_id = p_organization_id and m.status = 'active'
    and m.suspended_at is null and m.revoked_at is null;
$$;

revoke all on function public.resolve_staged_clerk_production_tenant(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_staged_clerk_production_tenant(text, text, uuid) to service_role;
