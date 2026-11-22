import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createClerkProductionIdentityGate } from '../dist/clerk-production-identity-gate.js';

const issuer = 'https://clerk.neptlium.com';
const app = 'https://app.neptlium.com';
const audience = 'neptlium-api';
const subject = 'user_fixture123';
const principal = '00000000-0000-4000-8000-000000000001';
const tenant = 'f0000000-0000-4000-8000-000000000002';
const otherTenant = '00000000-0000-4000-8000-000000000003';
const env = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  NEPTLIUM_AUTH_PROVIDER: 'clerk',
  NEPTLIUM_CLERK_CUTOVER_APPROVED: 'true',
  NEPTLIUM_IDENTITY_MAPPING_VERIFIED: 'true',
  NEPTLIUM_AUTH_ROLLBACK_VERIFIED: 'true',
  NEPTLIUM_CLERK_JWT_VERIFIER_VERIFIED: 'true',
  NEPTLIUM_CLERK_TENANT_ISOLATION_VERIFIED: 'true',
  NEPTLIUM_CLERK_ACCOUNT_BOOTSTRAP_VERIFIED: 'true',
  NEXT_PUBLIC_SITE_URL: app,
  NEPTLIUM_CLERK_PRODUCTION_ISSUER: issuer,
  NEPTLIUM_CLERK_PRODUCTION_AUDIENCE: audience,
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
const request = async url => {
  assert.equal(url.href, issuer + '/.well-known/jwks.json');
  return Response.json({ keys: [key] });
};
const store = {
  resolveActiveTenantPrincipal: async (iss, sub, org) =>
    iss === issuer && sub === subject && org === tenant ? principal : null,
};
const sid = 'sess_fixture123';
const sessions = {
  issuer,
  isActiveSession: async (session, user) => session === sid && user === subject,
};
const createGate = (config, membership, fetchKeys) =>
  createClerkProductionIdentityGate(config, membership, sessions, fetchKeys);

function jwt(claims = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = [
    { alg: 'RS256', typ: 'JWT', kid: 'fixture', ...header },
    { iss: issuer, aud: audience, azp: app, sub: subject, sid, iat: now - 5, nbf: now - 5, exp: now + 60, ...claims },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return payload + '.' + sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url');
}

test('production identity gate remains disabled unless all release and trust conditions match', () => {
  assert.equal(createGate({}, store, request), undefined);
  for (const key of Object.keys(env).filter(key => env[key] === 'true')) {
    assert.equal(createGate({ ...env, [key]: undefined }, store, request), undefined);
  }
  for (const override of [
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: undefined },
    { NODE_ENV: 'test' },
    { NEPTLIUM_AUTH_PROVIDER: 'supabase' },
    { NEXT_PUBLIC_SITE_URL: 'https://preview.neptlium.com' },
    { NEPTLIUM_CLERK_PRODUCTION_ISSUER: 'https://arriving-pup-3595.clerk.accounts.dev' },
    { NEPTLIUM_CLERK_PRODUCTION_ISSUER: 'https://clerk.neptlium.com/path' },
    { NEPTLIUM_CLERK_PRODUCTION_ISSUER: 'https://other.neptlium.com' },
    { NEPTLIUM_CLERK_PRODUCTION_ISSUER: 'https://clerk.neptlium.com.evil.example' },
    { NEPTLIUM_CLERK_PRODUCTION_AUDIENCE: 'neptlium-api-preview' },
  ]) assert.equal(createGate({ ...env, ...override }, store, request), undefined);
});

test('verified production subject resolves the preserved principal and active requested tenant', async () => {
  const gate = createGate(env, store, request);
  assert.deepEqual(await gate(jwt(), tenant.toUpperCase()), { principalId: principal, organizationId: tenant });
  assert.equal(await gate(jwt(), otherTenant), null);
  assert.equal(await gate(jwt({ sub: 'user_unlinked123' }), tenant), null);
});

test('bad JWT trust, invalid signature and inactive or unavailable membership deny', async () => {
  let reads = 0;
  const audited = { ...store, resolveActiveTenantPrincipal: async () => { reads++; return principal; } };
  const gate = createGate(env, audited, request);
  const forged = jwt().split('.');
  forged[2] = Buffer.alloc(256).toString('base64url');
  for (const token of [
    'malformed',
    forged.join('.'),
    jwt({ iss: 'https://arriving-pup-3595.clerk.accounts.dev' }),
    jwt({ aud: 'neptlium-api-preview' }),
    jwt({ azp: 'https://preview.neptlium.com' }),
    jwt({ exp: 1 }),
    jwt({ nbf: Math.floor(Date.now() / 1000) + 120 }),
    jwt({}, { typ: 'at+jwt' }),
    jwt({}, { kid: 'unknown', jku: 'https://untrusted.example/jwks' }),
  ]) assert.equal(await gate(token, tenant), null);
  assert.equal(reads, 0);

  for (const lookup of [async () => null, async () => { throw new Error('fixture outage'); }]) {
    const deny = createGate(env, { ...store, resolveActiveTenantPrincipal: lookup }, request);
    assert.equal(await deny(jwt(), tenant), null);
  }
  const outage = createGate(env, store, async () => new Response(null, { status: 503 }));
  assert.equal(await outage(jwt(), tenant), null);
  const malformed = createGate(env, audited, async () =>
    Response.json({ keys: [{ ...key, n: 'AQAB' }] }));
  const readsBeforeMalformed = reads;
  assert.equal(await malformed(jwt(), tenant), null);
  assert.equal(reads, readsBeforeMalformed);
});

test('session evidence is mandatory before tenant lookup', async () => {
  assert.equal(createClerkProductionIdentityGate(env, store, undefined, request), undefined);
  assert.equal(createClerkProductionIdentityGate(env, store, { ...sessions, issuer: 'https://other.neptlium.com' }, request), undefined);
  let reads = 0;
  const audited = { resolveActiveTenantPrincipal: async () => { reads++; return principal; } };
  const gate = createGate(env, audited, request);
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [
    { sid: undefined }, { sid: 'sess_revoked123' }, { exp: now + 600 },
    { iat: now - 121, exp: now + 1 }, { iat: now - 121, exp: now - 1 },
  ]) assert.equal(await gate(jwt(claims), tenant), null);
  for (const isActiveSession of [
    async () => false,
    async () => 'active',
    async () => { throw new Error('session authority unavailable'); },
  ]) {
    const deny = createClerkProductionIdentityGate(env, audited, { issuer, isActiveSession }, request);
    assert.equal(await deny(jwt(), tenant), null);
  }
  assert.equal(reads, 0);
});

test('a previously accepted token is denied when the same session is revoked', async () => {
  let active = true;
  let reads = 0;
  const gate = createClerkProductionIdentityGate(env, {
    resolveActiveTenantPrincipal: async () => { reads++; return principal; },
  }, {
    issuer,
    isActiveSession: async (sessionId, userId) => {
      assert.equal(sessionId, sid);
      assert.equal(userId, subject);
      return active;
    },
  }, request);
  const token = jwt();
  assert.deepEqual(await gate(token, tenant), { principalId: principal, organizationId: tenant });
  active = false;
  assert.equal(await gate(token, tenant), null);
  assert.equal(reads, 1);
});

test('tenant RPC binds issuer, subject and tenant and rejects malformed evidence', async () => {
  const { SupabaseClerkTenantMembershipStore } = await import('../dist/clerk-tenant-membership.js');
  let payload = principal;
  const adapter = new SupabaseClerkTenantMembershipStore('https://database.example.test', 'fixture-only', async (url, init) => {
    assert.equal(url, 'https://database.example.test/rest/v1/rpc/resolve_staged_clerk_production_tenant');
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { p_issuer: issuer, p_subject: subject, p_organization_id: tenant });
    return Response.json(payload);
  });
  const resolve = () => adapter.resolveActiveTenantPrincipal(issuer, subject, tenant);
  assert.equal(await resolve(), principal);
  payload = null;
  assert.equal(await resolve(), null);
  for (const malformed of [[principal], { principal }, true, 'bad-uuid']) {
    payload = malformed;
    await assert.rejects(resolve, { status: 503, code: 'identity_storage_unavailable' });
  }
});

test('rejects an alternate issuer even when the session authority matches it', () => {
  const alternate = 'https://other.neptlium.com';
  assert.equal(createClerkProductionIdentityGate(
    { ...env, NEPTLIUM_CLERK_PRODUCTION_ISSUER: alternate },
    store, { ...sessions, issuer: alternate }, request,
  ), undefined);
});

test('rejects a bearer that expires during tenant resolution', async (t) => {
  const start = Date.now();
  t.mock.method(Date, 'now', () => start);
  const gate = createGate(env, {
    resolveActiveTenantPrincipal: async () => {
      Date.now.mock.mockImplementation(() => start + 60_000);
      return principal;
    },
  }, request);
  assert.equal(await gate(jwt(), tenant), null);
});
