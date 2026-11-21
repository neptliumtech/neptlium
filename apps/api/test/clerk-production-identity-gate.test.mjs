import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createClerkProductionIdentityGate } from '../dist/clerk-production-identity-gate.js';
import { ClerkStagedProductionSessionAuthority, SupabaseStagedClerkProductionIdentityStore } from '../dist/staged-clerk-production-identity.js';

const issuer = 'https://clerk.neptlium.com';
const app = 'https://app.neptlium.com';
const audience = 'neptlium-api';
const subject = 'user_fixture123';
const sessionId = 'sess_fixture123';
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
  resolveTenant: async (iss, sub, org) => iss === issuer && sub === subject && org === tenant ? principal : null,
};

const sessions = {
  isActiveSession: async (iss, sub, sid) => iss === issuer && sub === subject && sid === sessionId,
};

function jwt(claims = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = [
    { alg: 'RS256', typ: 'JWT', kid: 'fixture', ...header },
    { iss: issuer, aud: audience, azp: app, sub: subject, sid: sessionId, iat: now - 5, nbf: now - 5, exp: now + 60, ...claims },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return payload + '.' + sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url');
}

test('production identity gate remains disabled unless all release and trust conditions match', () => {
  assert.equal(createClerkProductionIdentityGate({}, store, sessions, request), undefined);
  for (const key of Object.keys(env).filter(key => env[key] === 'true')) {
    assert.equal(createClerkProductionIdentityGate({ ...env, [key]: undefined }, store, sessions, request), undefined);
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
  ]) assert.equal(createClerkProductionIdentityGate({ ...env, ...override }, store, sessions, request), undefined);
});

test('verified production subject resolves the preserved principal and active requested tenant', async () => {
  const gate = createClerkProductionIdentityGate(env, store, sessions, request);
  assert.deepEqual(await gate(jwt(), tenant.toUpperCase()), { principalId: principal, organizationId: tenant });
  assert.equal(await gate(jwt(), otherTenant), null);
  assert.equal(await gate(jwt({ sub: 'user_unlinked123' }), tenant), null);
});

test('bad JWT trust, invalid signature and inactive or unavailable membership deny', async () => {
  let reads = 0;
  const audited = { ...store, resolveTenant: async () => { reads++; return principal; } };
  const gate = createClerkProductionIdentityGate(env, audited, sessions, request);
  const forged = jwt().split('.');
  forged[2] = Buffer.alloc(256).toString('base64url');
  for (const token of [
    'malformed',
    forged.join('.'),
    jwt({ iss: 'https://arriving-pup-3595.clerk.accounts.dev' }),
    jwt({ aud: 'neptlium-api-preview' }),
    jwt({ azp: 'https://preview.neptlium.com' }),
    jwt({ exp: 1 }),
    jwt({ sid: undefined }),
    jwt({ nbf: Math.floor(Date.now() / 1000) + 120 }),
    jwt({}, { typ: 'at+jwt' }),
    jwt({}, { kid: 'unknown', jku: 'https://untrusted.example/jwks' }),
  ]) assert.equal(await gate(token, tenant), null);
  assert.equal(reads, 0);

  for (const lookup of [async () => false, async () => { throw new Error('fixture outage'); }]) {
    const deny = createClerkProductionIdentityGate(env, { ...store, resolveTenant: lookup }, sessions, request);
    assert.equal(await deny(jwt(), tenant), null);
  }
  const outage = createClerkProductionIdentityGate(env, store, sessions, async () => new Response(null, { status: 503 }));
  assert.equal(await outage(jwt(), tenant), null);
  const malformed = createClerkProductionIdentityGate(env, audited, sessions, async () =>
    Response.json({ keys: [{ ...key, n: 'AQAB' }] }));
  const readsBeforeMalformed = reads;
  assert.equal(await malformed(jwt(), tenant), null);
  assert.equal(reads, readsBeforeMalformed);
});

test('a revoked or unavailable session denies before reading tenant storage', async () => {
  let reads = 0;
  const audited = { resolveTenant: async () => { reads++; return principal; } };
  for (const lookup of [async () => false, async () => { throw new Error('session outage'); }]) {
    const gate = createClerkProductionIdentityGate(env, audited, { isActiveSession: lookup }, request);
    assert.equal(await gate(jwt(), tenant), null);
  }
  assert.equal(reads, 0);
});

test('staged storage uses the issuer-scoped RPC and denies malformed or unavailable data', async () => {
  const origin = 'https://fixture.supabase.co';
  for (const [response, expected] of [
    [Response.json(principal), principal],
    [Response.json({ principalId: principal }), null],
    [new Response(null, { status: 503 }), null],
  ]) {
    let reads = 0;
    const storage = new SupabaseStagedClerkProductionIdentityStore(origin, 'fixture', async (url, options) => {
      reads++;
      assert.equal(url, origin + '/rest/v1/rpc/resolve_staged_clerk_production_tenant');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), { p_issuer: issuer, p_subject: subject, p_organization_id: tenant });
      return response;
    });
    assert.equal(await storage.resolveTenant('https://fixture.clerk.accounts.dev', subject, tenant), null);
    assert.equal(reads, 0);
    assert.equal(await storage.resolveTenant(issuer, subject, tenant), expected);
    assert.equal(reads, 1);
  }
});

test('staged session authority requires a fresh active session for the same subject', async () => {
  const session = { id: sessionId, user_id: subject, status: 'active', expire_at: Date.now() + 60_000 };
  let data = session;
  const authority = new ClerkStagedProductionSessionAuthority('sk_live_fixture', async (url, options) => {
    assert.equal(url, 'https://api.clerk.com/v1/sessions/' + sessionId);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return Response.json(data);
  });
  assert.equal(await authority.isActiveSession(issuer, subject, sessionId), true);
  for (const override of [
    { status: 'revoked' },
    { actor: { sub: 'user_another123' } },
    { id: 'sess_another123' },
    { user_id: 'user_another123' },
    { expire_at: 0 },
    { expire_at: undefined },
  ]) {
    data = { ...session, ...override };
    assert.equal(await authority.isActiveSession(issuer, subject, sessionId), false);
  }
});
