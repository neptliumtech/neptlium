import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { SupabaseClerkPreviewIdentityStore, authenticateClerkPreviewTenant } from '../dist/clerk-preview-identity.js';

const principalId = '00000000-0000-4000-8000-000000000001';
const orgId = '00000000-0000-4000-8000-000000000002';
const subject = 'user_12345678';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const trust = { issuer: 'https://clerk-preview.example.test', audience: 'preview-api', authorizedParties: ['https://preview.example.test'], keys: { k1: { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig' } }, nowSeconds: 2000000000 };
function token() {
  const parts = [{ alg: 'RS256', kid: 'k1', typ: 'JWT' }, { iss: trust.issuer, aud: trust.audience, azp: trust.authorizedParties[0], sub: subject, exp: 2000000300, iat: 1999999990, nbf: 1999999990 }].map(x => Buffer.from(JSON.stringify(x)).toString('base64url'));
  const body = parts.join('.');
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
}
const supabaseUserId = '00000000-0000-4000-8000-000000000111';
const clerk = { provider: 'CLERK', provider_subject: subject, clerk_issuer: trust.issuer, status: 'ACTIVE', revoked_at: null };
const legacy = { provider: 'SUPABASE_AUTH', provider_subject: supabaseUserId, status: 'ACTIVE', revoked_at: null };
const membership = { organization_id: orgId, user_id: supabaseUserId, status: 'active', suspended_at: null, revoked_at: null };
const active = {
  id: principalId, status: 'ACTIVE', suspended_at: null, retired_at: null,
  clerk: [clerk], legacy: [legacy], memberships: [membership],
};

function storeFor(rows, status = 200) {
  return new SupabaseClerkPreviewIdentityStore('https://db.example.test', 'fixture-only',
    async () => Response.json(rows, { status }));
}

test('durable resolver checks issuer, principal, legacy subject and membership in one request', async () => {
  const requests = [];
  const store = new SupabaseClerkPreviewIdentityStore('https://db.example.test', 'fixture-only', async (input, options) => {
    requests.push(input);
    const url = new URL(input);
    assert.equal(url.pathname, '/rest/v1/identity_principals');
    assert.equal(url.searchParams.get('clerk.clerk_issuer'), 'eq.' + trust.issuer);
    assert.equal(url.searchParams.get('legacy.provider'), 'eq.SUPABASE_AUTH');
    assert.equal(url.searchParams.get('memberships.organization_id'), 'eq.' + orgId);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return Response.json([active]);
  });
  assert.deepEqual(await authenticateClerkPreviewTenant(token(), orgId, trust, store, 'preview'), {
    principalId, organizationId: orgId,
  });
  assert.equal(requests.length, 1);
});

test('denies missing, ambiguous, conflicting, revoked, suspended and incomplete records', async () => {
  const badRows = [
    [], [active, active], [null],
    [{ ...active, clerk: [] }],
    [{ ...active, clerk: [clerk, clerk] }],
    [{ ...active, clerk: [{ ...clerk, clerk_issuer: 'https://other.example.test' }] }],
    [{ ...active, clerk: [{ ...clerk, revoked_at: '2026-01-01' }] }],
    [{ ...active, status: 'SUSPENDED' }],
    [{ ...active, suspended_at: undefined }],
    [{ ...active, retired_at: '2026-01-01' }],
    [{ ...active, legacy: [legacy, legacy] }],
    [{ ...active, legacy: [{ ...legacy, status: 'REVOKED' }] }],
    [{ ...active, memberships: [] }],
    [{ ...active, memberships: [membership, membership] }],
    [{ ...active, memberships: [{ ...membership, organization_id: principalId }] }],
    [{ ...active, memberships: [{ ...membership, user_id: principalId }] }],
    [{ ...active, memberships: [{ ...membership, suspended_at: '2026-01-01' }] }],
    [{ ...active, memberships: [{ ...membership, revoked_at: '2026-01-01' }] }],
    [{ ...active, memberships: [{ ...membership, status: undefined }] }],
  ];
  for (const rows of badRows) {
    assert.equal(await authenticateClerkPreviewTenant(token(), orgId, trust, storeFor(rows), 'preview'), null, JSON.stringify(rows));
  }
  await assert.rejects(() => authenticateClerkPreviewTenant(token(), orgId, trust, storeFor([], 503), 'preview'),
    { code: 'identity_storage_unavailable' });
});

test('invalid token, organization or environment never reaches storage', async () => {
  const store = { resolveActiveTenantPrincipal: async () => assert.fail('unexpected storage request') };
  assert.equal(await authenticateClerkPreviewTenant(token(), orgId, trust, store, 'production'), null);
  assert.equal(await authenticateClerkPreviewTenant(token(), 'not-a-uuid', trust, store, 'preview'), null);
  assert.equal(await authenticateClerkPreviewTenant('forged', orgId, trust, store, 'preview'), null);
});
