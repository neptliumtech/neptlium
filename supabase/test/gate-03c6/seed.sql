insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000061','gate03c6-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000062','gate03c6-b@example.invalid');
insert into public.organizations (id, owner_id, name) values
  ('00000000-0000-4000-8000-000000000063','00000000-0000-4000-8000-000000000061','Gate 03C.6 A'),
  ('00000000-0000-4000-8000-000000000064','00000000-0000-4000-8000-000000000062','Gate 03C.6 B');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000063','00000000-0000-4000-8000-000000000061','owner'),
  ('00000000-0000-4000-8000-000000000064','00000000-0000-4000-8000-000000000062','owner');
insert into public.ledger_accounts (id, owner_id, account_code, asset, account_class) values
  ('00000000-0000-4000-8000-000000000065','00000000-0000-4000-8000-000000000061','fixture:asset','USDC','asset');
