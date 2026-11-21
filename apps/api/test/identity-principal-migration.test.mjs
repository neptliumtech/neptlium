import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(
  new URL(
    '../../../supabase/migrations/20260825051902_identity_principal_provider_subject_foundation.sql',
    import.meta.url,
  ),
  'utf8',
);

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

async function productionShapedDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon noinherit;
    create role authenticated noinherit;
    create role service_role noinherit;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table public.profiles(
      id uuid primary key references auth.users(id),
      email text not null,
      user_id uuid unique references auth.users(id),
      created_at timestamptz not null default now()
    );
    create table public.ledger_accounts(id uuid primary key default gen_random_uuid());
    create table public.ledger_journals(id uuid primary key default gen_random_uuid());
    create table public.ledger_postings(id uuid primary key default gen_random_uuid());
    create table public.funding_intents(id uuid primary key default gen_random_uuid());
    create table public.transfer_executions(id uuid primary key default gen_random_uuid());
    create table public.settlement_evidence(id uuid primary key default gen_random_uuid());
    create table public.reconciliation_runs(id uuid primary key default gen_random_uuid());
    create table public.reconciliation_items(id uuid primary key default gen_random_uuid());
    insert into auth.users(id, email) values
      ('${first}', 'first@example.test'),
      ('${second}', 'second@example.test');
    insert into public.profiles(id, email, created_at) values
      ('${first}', 'first@example.test', '2026-01-01T00:00:00Z'),
      ('${second}', 'second@example.test', '2026-02-01T00:00:00Z');
    insert into public.ledger_accounts default values;
    insert into public.ledger_journals default values;
    insert into public.ledger_postings default values;
    insert into public.funding_intents default values;
    insert into public.transfer_executions default values;
    insert into public.settlement_evidence default values;
    insert into public.reconciliation_runs default values;
    insert into public.reconciliation_items default values;
  `);
  return db;
}

test('migration preserves profile UUIDs and backfills one Supabase subject per principal', async () => {
  const db = await productionShapedDatabase();
  try {
    await db.exec(migration);
    const principals = await db.query(
      `select id, status, created_at from public.identity_principals order by id`,
    );
    assert.deepEqual(
      principals.rows.map((row) => ({ id: row.id, status: row.status })),
      [
        { id: first, status: 'ACTIVE' },
        { id: second, status: 'ACTIVE' },
      ],
    );

    const subjects = await db.query(
      `select principal_id, provider, provider_subject, status
       from public.identity_provider_subjects order by principal_id`,
    );
    assert.deepEqual(subjects.rows, [
      { principal_id: first, provider: 'SUPABASE_AUTH', provider_subject: first, status: 'ACTIVE' },
      {
        principal_id: second,
        provider: 'SUPABASE_AUTH',
        provider_subject: second,
        status: 'ACTIVE',
      },
    ]);
    assert.equal(subjects.rows.some((row) => row.provider_subject.includes('@')), false);

    const events = await db.query(
      `select operation, count(*)::integer as count
       from public.identity_events group by operation order by operation`,
    );
    assert.deepEqual(events.rows, [
      { operation: 'principal.created', count: 2 },
      { operation: 'provider_subject.linked', count: 2 },
    ]);

    const security = await db.query(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('identity_principals', 'identity_provider_subjects', 'identity_events')
      order by c.relname
    `);
    assert.deepEqual(security.rows, [
      { relname: 'identity_events', relrowsecurity: true },
      { relname: 'identity_principals', relrowsecurity: true },
      { relname: 'identity_provider_subjects', relrowsecurity: true },
    ]);
    const grants = await db.query(`
      select grantee, table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('identity_principals', 'identity_provider_subjects', 'identity_events')
        and grantee in ('anon', 'authenticated', 'service_role')
      order by grantee, table_name, privilege_type
    `);
    assert.deepEqual(grants.rows, [
      { grantee: 'service_role', table_name: 'identity_events', privilege_type: 'SELECT' },
      { grantee: 'service_role', table_name: 'identity_principals', privilege_type: 'SELECT' },
      {
        grantee: 'service_role',
        table_name: 'identity_provider_subjects',
        privilege_type: 'SELECT',
      },
    ]);

    await assert.rejects(
      () => db.exec(`update public.identity_events set metadata = '{}'::jsonb`),
      /identity events are append-only/,
    );
    await assert.rejects(
      () => db.exec(`delete from public.identity_events`),
      /identity events are append-only/,
    );
    await assert.rejects(
      () =>
        db.query(
          `update public.identity_principals
           set status = 'SUSPENDED'
           where id = $1`,
          [first],
        ),
      /identity_principals_lifecycle_check/,
    );
    const sourceState = await db.query(`
      select
        (select count(*)::integer from auth.users) as auth_users,
        (select count(*)::integer from public.profiles) as profiles,
        (select count(*)::integer from public.ledger_accounts) as ledger_accounts,
        (select count(*)::integer from public.ledger_journals) as ledger_journals,
        (select count(*)::integer from public.ledger_postings) as ledger_postings,
        (select count(*)::integer from public.funding_intents) as funding_intents,
        (select count(*)::integer from public.transfer_executions) as transfer_executions,
        (select count(*)::integer from public.settlement_evidence) as settlement_evidence,
        (select count(*)::integer from public.reconciliation_runs) as reconciliation_runs,
        (select count(*)::integer from public.reconciliation_items) as reconciliation_items
    `);
    assert.deepEqual(sourceState.rows, [
      {
        auth_users: 2,
        profiles: 2,
        ledger_accounts: 1,
        ledger_journals: 1,
        ledger_postings: 1,
        funding_intents: 1,
        transfer_executions: 1,
        settlement_evidence: 1,
        reconciliation_runs: 1,
        reconciliation_items: 1,
      },
    ]);
  } finally {
    await db.close();
  }
});

test('Supabase identity mapping uniqueness constraints fail closed without mutating historical evidence', async () => {
  const db = await productionShapedDatabase();
  try {
    await db.exec(migration);

    await assert.rejects(
      () =>
        db.query(
          `insert into public.identity_provider_subjects(principal_id, provider, provider_subject)
           values ($1, 'SUPABASE_AUTH', $2)`,
          [second, first],
        ),
      /identity_provider_subjects_provider_subject_unique/,
    );

    await assert.rejects(
      () =>
        db.query(
          `insert into public.identity_provider_subjects(principal_id, provider, provider_subject)
           values ($1, 'SUPABASE_AUTH', '00000000-0000-4000-8000-000000000099')`,
          [first],
        ),
      /identity_provider_subjects_active_principal_provider_unique/,
    );

    const subjects = await db.query(
      `select principal_id, provider, provider_subject, status
       from public.identity_provider_subjects order by principal_id`,
    );
    assert.deepEqual(subjects.rows, [
      { principal_id: first, provider: 'SUPABASE_AUTH', provider_subject: first, status: 'ACTIVE' },
      { principal_id: second, provider: 'SUPABASE_AUTH', provider_subject: second, status: 'ACTIVE' },
    ]);
  } finally {
    await db.close();
  }
});

test('migration rejects an orphaned profile instead of inventing an identity', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon noinherit;
      create role authenticated noinherit;
      create role service_role noinherit;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.profiles(
        id uuid primary key,
        email text not null,
        created_at timestamptz not null default now()
      );
      insert into public.profiles(id, email) values ('${first}', 'orphan@example.test');
    `);
    await assert.rejects(
      () => db.exec(migration),
      /cannot backfill a profile without a matching Supabase Auth subject/,
    );
    const relation = await db.query(`select to_regclass('public.identity_principals') as value`);
    assert.equal(relation.rows[0].value, null);
  } finally {
    await db.close();
  }
});

test('staged Production continuity isolates issuers, preserves ownership and denies revoked or missing authority', async () => {
  const db = await productionShapedDatabase();
  const issuer = 'https://clerk.neptlium.com';
  const preview = 'https://fixture.clerk.accounts.dev';
  const subject = 'user_fixture123';
  const org = '00000000-0000-4000-8000-000000000003';
  const otherOrg = '00000000-0000-4000-8000-000000000004';
  const enroll = (iss, sub, user) => db.query(
    'select public.stage_clerk_production_continuity($1, $2, $3, $4) as id',
    [iss, sub, user, 'review-fixture'],
  );
  const resolve = async (iss = issuer, memberOrg = org) => (await db.query(
    'select public.resolve_staged_clerk_production_tenant($1, $2, $3) as id',
    [iss, subject, memberOrg],
  )).rows[0].id;

  try {
    await db.exec(migration);
    // Apply the actual membership DDL with an isolated organizations fixture.
    const platform = await readFile(new URL(
      '../../../supabase/migrations/20260914174500_platform_core_owner_control_plane.sql',
      import.meta.url,
    ), 'utf8');
    await db.exec('create table public.organizations(id uuid primary key)');
    await db.exec(platform.slice(
      platform.indexOf('create table public.organization_memberships ('),
      platform.indexOf('create table public.canonical_assets ('),
    ));
    await db.query('insert into public.organizations(id) values ($1), ($2)', [org, otherOrg]);
    await db.query(
      "insert into public.organization_memberships(organization_id, user_id, role) values ($1, $2, 'viewer'), ($3, $4, 'owner')",
      [org, first, otherOrg, second],
    );
    await db.query(
      "insert into public.identity_provider_subjects(principal_id, provider, provider_subject) values ($1, 'CLERK', $2)",
      [second, subject],
    );
    const staged = await readFile(new URL(
      '../../../supabase/migrations/20261121120000_stage_clerk_production_continuity.sql',
      import.meta.url,
    ), 'utf8');
    await db.exec(staged);

    assert.equal(await resolve(), null);
    await assert.rejects(enroll(preview, subject, first), { code: '23514' });
    await assert.rejects(enroll(issuer, subject, otherOrg), { code: 'P0002' });
    const retries = await Promise.all([
      enroll(issuer, subject, first),
      enroll(issuer, subject, first),
    ]);
    assert.deepEqual(retries.map(result => result.rows[0].id), [first, first]);
    await assert.rejects(enroll(issuer, subject, second), { code: 'P0002' });
    await assert.rejects(enroll(issuer, 'user_second123', first), { code: '23505' });
    assert.equal(await resolve(), first);
    assert.equal(await resolve(preview), null);
    assert.equal(await resolve(issuer, otherOrg), null);

    await db.exec('set role authenticated');
    await assert.rejects(resolve(), { code: '42501' });
    await db.exec('set role service_role');
    assert.equal(await resolve(), first);
    await assert.rejects(enroll(issuer, subject, first), { code: '42501' });
    await assert.rejects(db.query('select public.revoke_staged_clerk_production_link($1, $2, $3)',
      [issuer, subject, 'revoke-fixture']), { code: '42501' });
    await db.exec('reset role');

    await db.query("update public.identity_principals set status = 'SUSPENDED', suspended_at = now() where id = $1", [first]);
    assert.equal(await resolve(), null);
    await db.query("update public.identity_principals set status = 'ACTIVE', suspended_at = null where id = $1", [first]);
    await db.query("update public.organization_memberships set status = 'revoked', revoked_at = now() where user_id = $1", [first]);
    assert.equal(await resolve(), null);
    await db.query("update public.organization_memberships set status = 'active', revoked_at = null where user_id = $1", [first]);
    assert.equal(await resolve(), first);
    await db.query("update public.identity_provider_subjects set status = 'REVOKED', revoked_at = now() where provider = 'SUPABASE_AUTH' and principal_id = $1", [first]);
    assert.equal(await resolve(), null);
    await db.query("update public.identity_provider_subjects set status = 'ACTIVE', revoked_at = null where provider = 'SUPABASE_AUTH' and principal_id = $1", [first]);
    assert.equal(await resolve(), first);
    const revoke = () => db.query('select public.revoke_staged_clerk_production_link($1, $2, $3) as revoked',
      [issuer, subject, 'revoke-fixture']);
    assert.equal((await revoke()).rows[0].revoked, true);
    assert.equal((await revoke()).rows[0].revoked, false);
    assert.equal(await resolve(), null);
    await assert.rejects(enroll(issuer, subject, first), { code: 'P0002' });
    assert.deepEqual((await db.query('select id from public.identity_principals order by id')).rows,
      [{ id: first }, { id: second }]);
    assert.equal((await db.query('select count(*)::int as total from public.staged_clerk_production_links')).rows[0].total, 1);
  } finally {
    await db.close();
  }
});
