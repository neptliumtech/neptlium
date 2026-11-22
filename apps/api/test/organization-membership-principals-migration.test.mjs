import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

function migration(name) {
  return readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
}

const [identity, platform, candidate] = await Promise.all([
  migration('20260825051902_identity_principal_provider_subject_foundation'),
  migration('20260914174500_platform_core_owner_control_plane'),
  migration('20261121000000_organization_membership_principals'),
]);

const user = '00000000-0000-4000-8000-000000000001';
const principal = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const membershipInsert = `
  insert into public.organization_memberships (organization_id, user_id, role)
  select id, '${user}', 'viewer' from public.organizations
`;

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create table public.profiles (
      id uuid primary key, email text, full_name text, first_name text, last_name text,
      created_at timestamptz default now()
    );
    create table public.organizations (id uuid primary key default gen_random_uuid());
    grant select on public.organizations to service_role;
    create table public.ledger_accounts (asset text, network text);
    create table public.ledger_journals (posted_at timestamptz);
    insert into public.organizations values (default), (default), (default);
    insert into auth.users (id, email) values ('${user}', 'same@example.test'), ('${other}', 'same@example.test');
  `);
  await db.exec(identity);
  await db.exec(platform);
  await db.exec(`
    insert into public.identity_principals (id) values ('${principal}'), ('${other}');
    insert into public.identity_provider_subjects (principal_id, provider, provider_subject)
    values ('${principal}', 'SUPABASE_AUTH', '${user}'),
           ('${other}', 'SUPABASE_AUTH', '${other}');
  `);
  return db;
}

test('backfills exact subject links across all membership states and preserves legacy fields', async (t) => {
  const db = await fixture(t);
  await db.exec(`
    insert into public.organization_memberships
      (organization_id, user_id, role, status, created_at, suspended_at, revoked_at)
    select id, '${user}', 'auditor', state.status, '2026-01-01',
      case when state.status <> 'active' then '2026-02-01'::timestamptz end,
      case when state.status = 'revoked' then '2026-03-01'::timestamptz end
    from (
      select id, row_number() over (order by id) as position from public.organizations
    ) org
    join (values (1, 'active'), (2, 'suspended'), (3, 'revoked')) state(position, status)
      using (position);
  `);
  const before = await db.query('select * from public.organization_memberships order by id');
  await db.exec(candidate);
  const after = await db.query('select * from public.organization_memberships order by id');
  assert.deepEqual(after.rows, before.rows.map((row) => ({ ...row, principal_id: principal })));

  await assert.rejects(() => db.exec(`delete from auth.users where id = '${user}'`), { code: '23001' });
  await assert.rejects(() => db.exec('delete from public.organizations'), { code: '23001' });
  await assert.rejects(() => db.exec(`
    delete from public.identity_provider_subjects where principal_id = '${principal}';
    delete from public.identity_principals where id = '${principal}';
  `), { code: '23001' });
  const { rows } = await db.query(`
    select relrowsecurity from pg_class where oid = 'public.organization_memberships'::regclass
  `);
  assert.equal(rows[0].relrowsecurity, true);
  await db.exec('set role authenticated');
  await assert.rejects(() => db.query('select principal_id from public.organization_memberships'), { code: '42501' });
  await db.exec('set role anon');
  await assert.rejects(() => db.query('select principal_id from public.organization_memberships'), { code: '42501' });
});

test('legacy service-role inserts bind automatically and conflicting writes fail', async (t) => {
  const db = await fixture(t);
  await db.exec(candidate);
  await db.exec('set role service_role');
  const result = await db.query(`${membershipInsert} limit 1 returning principal_id`);
  assert.deepEqual(result.rows, [{ principal_id: principal }]);
  await assert.rejects(() => db.exec(`
    insert into public.organization_memberships (organization_id, user_id, principal_id, role)
    select id, '${user}', '${other}', 'viewer' from public.organizations
  `), /principal conflicts/);
  await assert.rejects(() => db.exec(`
    update public.organization_memberships set principal_id = '${other}'
  `), /principal conflicts/);
  await assert.rejects(() => db.exec(`
    update public.organization_memberships set user_id = '${other}'
  `), /legacy user is immutable/);
  await assert.rejects(() => db.exec(`
    insert into public.organization_memberships (organization_id, user_id, role)
    select organization_id, user_id, role from public.organization_memberships
  `), { code: '23505' });
  await db.exec(`
    reset role;
    update public.identity_provider_subjects set status = 'REVOKED', revoked_at = now()
    where provider_subject = '${user}';
    set role service_role;
    update public.organization_memberships set status = 'revoked', revoked_at = now();
  `);
  await assert.rejects(() => db.exec(membershipInsert), /exactly one active Supabase Auth mapping/);
});

for (const [name, corruption] of [
  ['missing', `delete from public.identity_provider_subjects where provider_subject = '${user}'`],
  ['revoked', `update public.identity_provider_subjects set status = 'REVOKED', revoked_at = now()
    where provider_subject = '${user}'`],
  ['inactive principal', `update public.identity_principals set status = 'SUSPENDED', suspended_at = now()
    where id = '${principal}'`],
  ['duplicate subject', `
    alter table public.identity_provider_subjects drop constraint identity_provider_subjects_provider_subject_unique;
    drop index public.identity_provider_subjects_active_principal_provider_unique;
    insert into public.identity_provider_subjects (principal_id, provider, provider_subject)
    values ('${other}', 'SUPABASE_AUTH', '${user}')
  `],
  ['conflicting subjects for one principal', `
    drop index public.identity_provider_subjects_active_principal_provider_unique;
    update public.identity_provider_subjects set principal_id = '${principal}'
    where provider_subject = '${other}'
  `],
]) {
  test(`backfill rolls back on ${name} identity evidence`, async (t) => {
    const db = await fixture(t);
    await db.exec(membershipInsert);
    const before = await db.query('select * from public.organization_memberships order by id');
    await db.exec(corruption);
    await assert.rejects(() => db.exec(candidate), /exactly one active Supabase Auth mapping/);
    await db.exec('rollback');
    assert.deepEqual(await db.query('select * from public.organization_memberships order by id'), before);
  });
}

const migrationsDirectory = new URL('../../../supabase/migrations/', import.meta.url);
const reconciliation = '20261121140000_reconcile_gate03c_authorities';
const chain = (await readdir(migrationsDirectory)).filter(name =>
  name.endsWith('.sql') && name >= '20261120000000',
).sort();

async function applyReconciledChain(db) {
  await db.exec(await migration('20260815115118_distributed_api_rate_limiting'));
  for (const name of chain) {
    await db.exec(await migration(name.slice(0, -4)));
  }
}

test('ordered migrations enforce one reviewed Clerk binding through legacy subject retirement', async (t) => {
  const db = await fixture(t);
  const issuer = 'https://clerk.neptlium.com';
  const subject = 'user_fixture123';
  const { rows: [{ id: tenant }, { id: otherTenant }] } = await db.query('select id from public.organizations order by id');
  await db.query(`
    insert into public.organization_memberships (organization_id, user_id, role)
    values ($1, $2, 'viewer')
  `, [tenant, user]);
  await applyReconciledChain(db);

  const resolve = (iss = issuer, org = tenant, sub = subject) => db.query(
    'select public.resolve_staged_clerk_production_tenant($1, $2, $3) as principal', [iss, sub, org],
  );
  const enroll = (sub = subject, legacyUser = user, evidence = 'review-1') => db.query(
    'select public.stage_clerk_production_continuity($1, $2, $3, $4) as principal',
    [issuer, sub, legacyUser, evidence],
  );
  await db.query(`
    insert into public.identity_provider_subjects (principal_id, provider, provider_subject, clerk_issuer)
    values ($1, 'CLERK', $2, $3)
  `, [principal, subject, issuer]);
  assert.deepEqual((await resolve()).rows, [{ principal: null }]);
  assert.deepEqual((await enroll()).rows, [{ principal }]);
  assert.deepEqual((await enroll()).rows, [{ principal }]);
  await assert.rejects(() => enroll(subject, other));
  await assert.rejects(() => enroll('user_different123'));
  await assert.rejects(() => enroll(subject, user, 'different-evidence'));
  await assert.rejects(() => db.exec('delete from public.staged_clerk_production_links'), /cannot be removed/);
  await assert.rejects(() => db.exec("update public.staged_clerk_production_links set evidence_ref = 'changed'"), /immutable/);

  await db.exec(`
    update public.identity_provider_subjects set status = 'REVOKED', revoked_at = now()
    where provider = 'SUPABASE_AUTH';
    set role service_role;
  `);
  assert.deepEqual((await resolve()).rows, [{ principal }]);
  assert.deepEqual((await resolve(issuer, otherTenant)).rows, [{ principal: null }]);
  assert.deepEqual((await resolve('https://preview.example.test')).rows, [{ principal: null }]);
  assert.deepEqual((await resolve(issuer, tenant, 'user_unknown123')).rows, [{ principal: null }]);
  await assert.rejects(() => db.query('select public.resolve_clerk_tenant_principal($1, $2, $3)', [issuer, subject, tenant]), { code: '42883' });
  await assert.rejects(() => db.query('update public.organization_memberships set organization_id = $1', [otherTenant]), { code: '42501' });
  await assert.rejects(() => enroll(), { code: '42501' });
  await assert.rejects(() => db.query('select * from public.staged_clerk_production_links'), { code: '42501' });
  await db.exec("begin; update public.organization_memberships set status = 'suspended', suspended_at = now()");
  assert.deepEqual((await resolve()).rows, [{ principal: null }]);
  await db.exec('rollback');
  await db.exec('reset role');
  await db.exec('begin');
  await db.query("update public.identity_principals set status = 'SUSPENDED', suspended_at = now() where id = $1", [principal]);
  assert.deepEqual((await resolve()).rows, [{ principal: null }]);
  await db.exec('rollback');
  assert.deepEqual((await resolve()).rows, [{ principal }]);
  const revoke = () => db.query(
    'select public.revoke_staged_clerk_production_link($1, $2, $3) as revoked', [issuer, subject, 'review-2'],
  );
  assert.deepEqual((await revoke()).rows, [{ revoked: true }]);
  assert.deepEqual((await revoke()).rows, [{ revoked: false }]);
  assert.deepEqual((await resolve()).rows, [{ principal: null }]);
  await assert.rejects(() => db.exec('update public.staged_clerk_production_links set revoked_at = null'), /immutable/);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => resolve(), { code: '42501' });
  }
});

test('ordered migrations preserve legacy signup and reject revoked or reassigned subjects', async (t) => {
  const db = await fixture(t);
  await applyReconciledChain(db);
  await db.exec(`
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();
  `);
  const newUser = '00000000-0000-4000-8000-000000000004';
  const revokedUser = '00000000-0000-4000-8000-000000000005';
  const conflictingUser = '00000000-0000-4000-8000-000000000006';
  await db.query('insert into auth.users (id, email) values ($1, $2)', [newUser, 'same@example.test']);
  assert.deepEqual((await db.query(
    'select principal_id from public.identity_provider_subjects where provider_subject = $1', [newUser],
  )).rows, [{ principal_id: newUser }]);
  await db.exec(`
    insert into public.identity_principals (id) values ('${revokedUser}');
    insert into public.identity_provider_subjects (principal_id, provider, provider_subject, status, revoked_at)
    values ('${revokedUser}', 'SUPABASE_AUTH', '${revokedUser}', 'REVOKED', now()),
           ('${other}', 'SUPABASE_AUTH', '${conflictingUser}', 'REVOKED', now());
  `);
  for (const id of [revokedUser, conflictingUser]) {
    await assert.rejects(() => db.query('insert into auth.users (id) values ($1)', [id]), {
      code: '23514',
    });
    assert.deepEqual((await db.query('select id from auth.users where id = $1', [id])).rows, []);
  }
});

test('ordered migrations retain post-lock timing, saturation and limiter privileges', async (t) => {
  const db = await fixture(t);
  await applyReconciledChain(db);
  const { rows: [{ body }] } = await db.query(`
    select pg_get_functiondef('public.consume_api_rate_limit(text,integer,integer)'::regprocedure) as body
  `);
  assert.match(body, /for update;\s+v_now := clock_timestamp/);
  await db.exec('set role service_role');
  const key = 'a'.repeat(64);
  const consume = (limit, window) => db.query(
    'select allowed, remaining from public.consume_api_rate_limit($1, $2, $3)', [key, limit, window],
  );
  await assert.rejects(() => consume(null, 60_000), /invalid rate-limit policy/);
  assert.deepEqual((await consume(1, 60_000)).rows, [{ allowed: true, remaining: 0 }]);
  assert.deepEqual((await consume(1, 60_000)).rows, [{ allowed: false, remaining: 0 }]);
  await assert.rejects(() => db.exec('delete from public.api_rate_limits'), { code: '42501' });
  await db.exec('reset role');
  assert.deepEqual((await db.query('select request_count from public.api_rate_limits')).rows, [{ request_count: 1 }]);
  await db.exec('set role authenticated');
  await assert.rejects(() => consume(1, 60_000), { code: '42501' });
});

test('later migrations that touch limiter authority require a new reconciliation review', async () => {
  for (const name of chain.filter(file => file > `${reconciliation}.sql`)) {
    assert.doesNotMatch(await migration(name.slice(0, -4)), /consume_api_rate_limit|api_rate_limits/i, name);
  }
});

test('rehearses additive schema rollback and restores legacy membership writes on disposable data', async (t) => {
  const db = await fixture(t);
  await db.exec(`${membershipInsert} limit 1`);
  const before = await db.query('select * from public.organization_memberships');
  await db.exec(candidate);
  await db.exec(`
    begin;
    drop function public.resolve_clerk_tenant_principal(text, text, uuid);
    drop trigger bind_organization_membership_principal on public.organization_memberships;
    drop function public.bind_organization_membership_principal();
    alter table public.organization_memberships drop column principal_id;
    alter table public.identity_provider_subjects drop column clerk_issuer;
    commit;
  `);
  await db.exec('set role service_role');
  assert.deepEqual((await db.query('select * from public.organization_memberships')).rows, before.rows);
  await db.exec(`
    insert into public.organization_memberships (organization_id, user_id, role)
    select organization_id, '${other}', 'viewer' from public.organization_memberships;
  `);
  assert.equal((await db.query('select id from public.organization_memberships')).rows.length, 2);
});

test('catalog confirms membership ACL grantors, function ownership and RLS in the disposable fixture', async (t) => {
  const db = await fixture(t);
  await db.exec(candidate);
  const { rows: [membership] } = await db.query(`
    select relrowsecurity as rls, pg_get_userbyid(relowner) as owner
    from pg_class where oid = 'public.organization_memberships'::regclass
  `);
  assert.equal(membership.rls, true);
  const { rows: grants } = await db.query(`
    select pg_get_userbyid(a.grantor) as grantor, a.privilege_type
    from pg_class c cross join lateral aclexplode(c.relacl) a
    where c.oid = 'public.organization_memberships'::regclass
      and a.grantee = 'service_role'::regrole
    order by a.privilege_type
  `);
  assert.deepEqual(grants, ['INSERT', 'SELECT', 'UPDATE'].map(privilege_type => ({
    grantor: membership.owner, privilege_type,
  })));
  const { rows: functions } = await db.query(`
    select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service,
      (select pg_get_userbyid(a.grantor) from aclexplode(p.proacl) a
        where a.grantee = 'service_role'::regrole and a.privilege_type = 'EXECUTE') as service_grantor
    from pg_proc p
    where p.oid in ('public.bind_organization_membership_principal()'::regprocedure,
      'public.resolve_clerk_tenant_principal(text,text,uuid)'::regprocedure)
    order by p.proname
  `);
  assert.deepEqual(functions, [
    { proname: 'bind_organization_membership_principal', owner: membership.owner,
      prosecdef: true, anon: false, authenticated: false, service: false, service_grantor: null },
    { proname: 'resolve_clerk_tenant_principal', owner: membership.owner,
      prosecdef: false, anon: false, authenticated: false, service: true, service_grantor: membership.owner },
  ]);
});
