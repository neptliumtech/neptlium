import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { clerkPreviewRouteConfig, createClerkPreviewSessionRoute } from '../dist/clerk-preview-session-route.js';

const issuer = 'https://fixture.clerk.accounts.dev';
const party = 'https://app-preview.example.test';
const audience = 'neptlium-api-preview';
const principalId = '00000000-0000-4000-8000-000000000001';
const organizationId = '00000000-0000-4000-8000-000000000002';
const otherOrganization = '00000000-0000-4000-8000-000000000003';
const legacyUser = '00000000-0000-4000-8000-000000000004';
const existing = 'user_existing123';
const unlinked = 'user_unlinked123';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  VERCEL_ENV: 'preview',
  NEPTLIUM_API_AUTH_PROVIDER: 'clerk-preview',
  NEPTLIUM_CLERK_API_VERIFIER_TESTED: 'true',
  NEPTLIUM_CLERK_IDENTITY_RESOLVER_TESTED: 'true',
  NEPTLIUM_CLERK_TENANT_ISOLATION_TESTED: 'true',
  NEPTLIUM_CLERK_PREVIEW_ISSUER: issuer,
  NEPTLIUM_CLERK_PREVIEW_AUDIENCE: audience,
  NEPTLIUM_CLERK_PREVIEW_APP_ORIGIN: party,
  NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL: 'https://ntbaoylcrwkowqqvzkno.supabase.co',
  NEPTLIUM_CLERK_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
};
function bearer(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    { alg: 'RS256', typ: 'JWT', kid: 'preview-key' },
    { iss: issuer, aud: audience, azp: party, sub: existing, iat: now, nbf: now, exp: now + 60, ...overrides },
  ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url'));
  const body = parts.join('.');
  return { authorization: 'Bearer ' + body + '.' + sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url') };
}

function fixtureFetch({ jwksUnavailable = false, storageUnavailable = false } = {}) {
  return async (input, options) => {
    const url = new URL(input);
    if (url.origin === issuer) {
      assert.equal(url.pathname, '/.well-known/jwks.json');
      assert.equal(options.headers, undefined);
      return jwksUnavailable ? new Response(null, { status: 503 }) : Response.json({
        keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'preview-key', alg: 'RS256', use: 'sig' }],
      });
    }
    assert.equal(url.origin, env.NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL);
    assert.equal(options.method, undefined);
    assert.equal(options.headers.apikey, 'fixture-only');
    if (storageUnavailable) return new Response(null, { status: 503 });
    const query = url.searchParams;
    assert.equal(url.pathname, '/rest/v1/identity_principals');
    assert.equal(query.get('clerk.clerk_issuer'), 'eq.' + issuer);
    return Response.json(query.get('clerk.provider_subject') === 'eq.' + existing &&
      query.get('memberships.organization_id') === 'eq.' + organizationId ? [{
        id: principalId, status: 'ACTIVE', suspended_at: null, retired_at: null,
        clerk: [{ provider: 'CLERK', provider_subject: existing, clerk_issuer: issuer, status: 'ACTIVE', revoked_at: null }],
        legacy: [{ provider: 'SUPABASE_AUTH', provider_subject: legacyUser, status: 'ACTIVE', revoked_at: null }],
        memberships: [{ organization_id: organizationId, user_id: legacyUser, status: 'active', suspended_at: null, revoked_at: null }],
      }] : []);
  };
}

test('Clerk route configuration fails closed outside Preview and with a database outside Neptlium Dev', () => {
  assert.ok(clerkPreviewRouteConfig(env));
  assert.ok(clerkPreviewRouteConfig({
    ...env,
    SUPABASE_URL: env.NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.NEPTLIUM_CLERK_PREVIEW_SUPABASE_SERVICE_ROLE_KEY,
  }));
  for (const overrides of [
    { VERCEL_ENV: 'production' },
    { VERCEL_TARGET_ENV: 'production' },
    { NEPTLIUM_CLERK_TENANT_ISOLATION_TESTED: undefined },
    { NEPTLIUM_CLERK_PREVIEW_AUDIENCE: undefined },
    { NEPTLIUM_CLERK_PREVIEW_ISSUER: issuer + '/path' },
    { NEPTLIUM_CLERK_PREVIEW_APP_ORIGIN: 'https://neptlium-app.vercel.app' },
    { SUPABASE_URL: 'https://udghxwlhztwxvkjaefjh.supabase.co' },
    { NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL: 'https://udghxwlhztwxvkjaefjh.supabase.co' },
    { NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL: 'https://db.example.test' },
  ]) assert.equal(clerkPreviewRouteConfig({ ...env, ...overrides }), undefined);
});

test('resolves a preserved principal and denies wrong tenants, new unlinked subjects and invalid claims', async () => {
  const session = createClerkPreviewSessionRoute(clerkPreviewRouteConfig(env), fixtureFetch());
  assert.deepEqual(await session(bearer(), organizationId), { principalId, organizationId });
  assert.equal(await session(bearer(), otherOrganization), null);
  for (const claims of [{ sub: unlinked }, { iss: party }, { aud: 'other' }, { azp: issuer }, { exp: 0 }, { exp: Math.floor(Date.now() / 1000) + 300 }]) {
    assert.equal(await session(bearer(claims), organizationId), null);
  }
  assert.equal(await session({ authorization: 'Bearer malformed' }, organizationId), null);
});

test('denies on key service failure and reports unavailable durable identity storage', async () => {
  const config = clerkPreviewRouteConfig(env);
  const keysDown = createClerkPreviewSessionRoute(config, fixtureFetch({ jwksUnavailable: true }));
  assert.equal(await keysDown(bearer(), organizationId), null);
  const storageDown = createClerkPreviewSessionRoute(config, fixtureFetch({ storageUnavailable: true }));
  await assert.rejects(() => storageDown(bearer(), organizationId), { code: 'identity_storage_unavailable' });
});

test('canonical application exposes only the enabled Preview GET route', async () => {
  const { buildThesisApp } = await import('../dist/thesis-app.js');
  const { loadConfig } = await import('../dist/config.js');
  const url = '/v1/preview/clerk/session?organization_id=' + organizationId;
  const inject = { method: 'GET', url, headers: bearer() };
  const app = await buildThesisApp({
    config: loadConfig({ ...env, NODE_ENV: 'test', API_ALLOWED_ORIGINS: party }),
    clerkPreviewFetch: fixtureFetch(),
  });
  const response = await app.inject(inject);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json(), { principalId, organizationId });
  assert.equal((await app.inject({ ...inject, headers: {} })).statusCode, 401);
  assert.equal((await app.inject({ ...inject, method: 'POST' })).statusCode, 404);
  for (const origin of [party, 'https://app.neptlium.com', 'null', '']) {
    const browser = await app.inject({ ...inject, headers: { ...inject.headers, origin } });
    assert.equal(browser.statusCode, 403);
    assert.equal(browser.headers['access-control-allow-origin'], undefined);
  }
  const preflight = await app.inject({ ...inject, method: 'OPTIONS', headers: { origin: party } });
  assert.equal(preflight.statusCode, 403);
  assert.equal(preflight.headers['access-control-allow-origin'], undefined);
  assert.equal((await app.inject({ ...inject, url: url + '&organization_id=' + otherOrganization })).statusCode, 422);
  const disabled = await buildThesisApp({
    config: loadConfig({ ...env, NODE_ENV: 'test', VERCEL_ENV: 'production' }),
    clerkPreviewFetch: () => assert.fail('disabled route fetched dependencies'),
  });
  assert.equal((await disabled.inject(inject)).statusCode, 404);
});

test('canonical HTTP server serves the Preview result without cookies, caching or CORS', async () => {
  const { buildThesisApp } = await import('../dist/thesis-app.js');
  const { loadConfig } = await import('../dist/config.js');
  const app = await buildThesisApp({
    config: loadConfig({ ...env, NODE_ENV: 'test' }),
    clerkPreviewFetch: fixtureFetch(),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const { port } = app.server.address();
    const endpoint = 'http://127.0.0.1:' + port + '/v1/preview/clerk/session?organization_id=';
    const response = await fetch(endpoint + organizationId, { headers: bearer() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { principalId, organizationId });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    for (const tenant of [organizationId, otherOrganization]) {
      const denied = await fetch(endpoint + tenant, { headers: tenant === organizationId ? bearer({ sub: unlinked }) : bearer() });
      assert.equal(denied.status, 401);
      assert.equal((await denied.json()).error.code, 'authentication_required');
    }
  } finally {
    await app.close();
  }
});
