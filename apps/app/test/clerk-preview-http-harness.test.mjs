import assert from 'node:assert/strict';
import test from 'node:test';
import { runClerkPreviewHttp } from '../../../scripts/clerk-preview-http.mjs';

const env = {
  PREVIEW_API_ORIGIN: 'https://neptlium-api-fixture-neptliumforge.vercel.app',
  PREVIEW_APP_ORIGIN: 'https://neptlium-app-fixture-neptliumforge.vercel.app',
  PREVIEW_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000001',
  PREVIEW_OTHER_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000002',
  PREVIEW_PRINCIPAL_ID: '00000000-0000-4000-8000-000000000003',
  VERCEL_OIDC_TOKEN: 'workload.token.fixture',
  PREVIEW_LINKED_CLERK_TOKEN: 'linked.token.fixture',
  PREVIEW_UNLINKED_CLERK_TOKEN: 'unlinked.token.fixture',
};

test('hosted HTTP matrix requires application JSON and scopes credentials to the configured API', async () => {
  const calls = [];
  const reports = [];
  const response = (status, body) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  await runClerkPreviewHttp(env, async (url, options) => {
    calls.push(options);
    assert.equal(url.origin, env.PREVIEW_API_ORIGIN);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'], env.VERCEL_OIDC_TOKEN);
    if (calls.length === 1) {
      assert.equal(options.headers.authorization, 'Bearer ' + env.PREVIEW_LINKED_CLERK_TOKEN);
      return response(200, { principalId: env.PREVIEW_PRINCIPAL_ID, organizationId: env.PREVIEW_ORGANIZATION_ID });
    }
    if (calls.length === 2) assert.equal(options.headers.authorization, 'Bearer ' + env.PREVIEW_UNLINKED_CLERK_TOKEN);
    if (calls.length === 3) assert.equal(url.searchParams.get('organization_id'), env.PREVIEW_OTHER_ORGANIZATION_ID);
    if (calls.length === 4) assert.equal(options.headers.authorization, undefined);
    if (calls.length === 5) {
      assert.equal(url.searchParams.getAll('organization_id').length, 2);
      return response(422, { error: { code: 'validation_failed' } });
    }
    if (calls.length === 6) {
      assert.equal(options.method, 'OPTIONS');
      assert.equal(options.headers.origin, env.PREVIEW_APP_ORIGIN);
      assert.equal(options.headers['access-control-request-method'], 'GET');
      assert.equal(options.headers['access-control-request-headers'], 'authorization');
      return response(403, { error: { code: 'forbidden' } });
    }
    return response(401, { error: { code: 'authentication_required' } });
  }, (line) => reports.push(line));
  assert.equal(calls.length, 6);
  assert.equal(reports.length, 6);
});

test('wrong destinations, protection pages, and unexpected bodies cannot pass', async () => {
  const quiet = () => {};
  await assert.rejects(() => runClerkPreviewHttp(
    { ...env, PREVIEW_API_ORIGIN: 'https://api.neptlium.com' },
    () => assert.fail('unexpected request'),
    quiet,
  ), /Invalid or missing PREVIEW_API_ORIGIN/);
  await assert.rejects(() => runClerkPreviewHttp(
    env, async () => new Response('<html>Protection</html>', { status: 401 }), quiet,
  ), /FAIL linked tenant \(HTTP 401\)/);
  await assert.rejects(() => runClerkPreviewHttp(
    env, async () => Response.json({ principalId: env.PREVIEW_PRINCIPAL_ID }), quiet,
  ), /FAIL linked tenant \(HTTP 200\)/);
});
