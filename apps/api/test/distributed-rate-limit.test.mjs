import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { SupabaseRateLimiter } from '../dist/security.js';

const reset = new Date(Date.now() + 60_000).toISOString();

test('distributed limiter uses server-only RPC with an opaque key', async () => {
  let call;
  const limiter = new SupabaseRateLimiter('https://example.supabase.co', 'service-secret', async (url, init) => {
    call = { url, init };
    return Response.json([{ allowed: true, remaining: 4, reset_at: reset }]);
  });
  const result = await limiter.consume('customer-ip:read', 5, 60_000);
  assert.equal(result.remaining, 4);
  assert.match(call.url, /\/rest\/v1\/rpc\/consume_api_rate_limit$/);
  assert.equal(call.init.headers.authorization, 'Bearer service-secret');
  assert.equal(call.init.redirect, 'error');
  const body = JSON.parse(call.init.body);
  assert.match(body.p_key, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(body).sort(), ['p_key', 'p_limit', 'p_window_ms']);
  assert.equal(body.p_limit, 5);
  assert.equal(body.p_window_ms, 60_000);
  assert.equal(call.init.body.includes('customer-ip'), false);
});

test('distributed limiter fails closed on missing RPC, denied permissions, and storage outages', async () => {
  for (const request of [
    async () => Response.json({ code: 'PGRST202' }, { status: 404 }),
    async () => Response.json({ code: '42501' }, { status: 403 }),
    async () => new Response(null, { status: 503 }),
    async () => { throw new Error('fixture transport failure'); },
  ]) {
    const limiter = new SupabaseRateLimiter('https://example.supabase.co', 'fixture-only', request);
    await assert.rejects(() => limiter.consume('key', 5, 60_000), {
      status: 503,
      code: 'rate_limit_unavailable',
    });
  }
});

test('distributed limiter denies malformed and ambiguous storage decisions', async () => {
  const row = { allowed: true, remaining: 4, reset_at: reset };
  for (const payload of [
    { 0: row },
    [row, row],
    [],
    [{ ...row, remaining: -1 }],
    [{ ...row, remaining: 1.5 }],
    [{ ...row, remaining: 5 }],
    [{ ...row, allowed: false, remaining: 2 }],
    [{ ...row, reset_at: 'invalid' }],
  ]) {
    const limiter = new SupabaseRateLimiter('https://example.supabase.co', 'fixture-only', async () => Response.json(payload));
    await assert.rejects(() => limiter.consume('key', 5, 60_000), {
      status: 503,
      code: 'rate_limit_unavailable',
    });
  }
});

test('distributed limiter preserves explicit throttling', async () => {
  const limiter = new SupabaseRateLimiter('https://example.supabase.co', 'service', async () =>
    Response.json([{ allowed: false, remaining: 0, reset_at: reset }]),
  );
  await assert.rejects(() => limiter.consume('key', 5, 60_000), (error) => error.code === 'rate_limited');
});

test('distributed limiter migration is RLS-protected and service-role-only', () => {
  const migration = readFileSync(
    resolve(import.meta.dirname, '../../../supabase/migrations/20260815115118_distributed_api_rate_limiting.sql'),
    'utf8',
  );
  assert.match(migration, /alter table public\.api_rate_limits enable row level security/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
});

test('distributed limiter persists a window and denies browser-role RPC execution on disposable PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    const migration = readFileSync(
      resolve(import.meta.dirname, '../../../supabase/migrations/20260815115118_distributed_api_rate_limiting.sql'),
      'utf8',
    );
    await db.exec(migration);
    await db.exec('grant all on public.api_rate_limits to service_role, authenticated, anon');
    await db.exec(readFileSync(
      resolve(import.meta.dirname, '../../../supabase/migrations/20261120000000_harden_distributed_api_rate_limiting.sql'),
      'utf8',
    ));
    await db.exec('set role service_role');
    const consume = () => db.query(
      'select allowed, remaining from public.consume_api_rate_limit($1, $2, $3)',
      ['a'.repeat(64), 2, 60_000],
    );
    for (const policy of [[null, 1000], [2, null], [0, 1000], [2, 999]]) {
      await assert.rejects(() => db.query(
        'select * from public.consume_api_rate_limit($1, $2, $3)', ['a'.repeat(64), ...policy],
      ), /invalid rate-limit policy/);
    }
    await assert.rejects(() => db.query('select * from public.api_rate_limits'), { code: '42501' });
    const decisions = (await Promise.all(Array.from({ length: 12 }, consume))).flatMap(result => result.rows);
    assert.deepEqual(decisions.filter(decision => decision.allowed), [
      { allowed: true, remaining: 1 }, { allowed: true, remaining: 0 },
    ]);
    assert.ok(decisions.filter(decision => !decision.allowed).every(decision => decision.remaining === 0));
    await db.exec('reset role');
    assert.deepEqual((await db.query('select request_count from public.api_rate_limits')).rows, [{ request_count: 2 }]);
    for (const role of ['authenticated', 'anon']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(consume, { code: '42501' });
      await assert.rejects(() => db.query('select * from public.api_rate_limits'), { code: '42501' });
    }
  } finally {
    await db.close();
  }
});
