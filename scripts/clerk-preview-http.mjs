import { pathToFileURL } from 'node:url';

const previewOrigin = /^https:\/\/[a-z0-9-]+-neptliumforge\.vercel\.app$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function required(env, key, pattern) {
  const value = env[key];
  if (!value || value.length > 16384 || !pattern.test(value)) throw new Error(`Invalid or missing ${key}`);
  return value;
}

export async function runClerkPreviewHttp(env, request = fetch, report = console.log) {
  const api = required(env, 'PREVIEW_API_ORIGIN', previewOrigin);
  const app = required(env, 'PREVIEW_APP_ORIGIN', previewOrigin);
  if (api === app) throw new Error('Select distinct, verified Preview deployments');
  const tenant = required(env, 'PREVIEW_ORGANIZATION_ID', uuid);
  const other = required(env, 'PREVIEW_OTHER_ORGANIZATION_ID', uuid);
  if (tenant === other) throw new Error('Select distinct fixture organizations');
  const principal = required(env, 'PREVIEW_PRINCIPAL_ID', uuid);
  const oidc = required(env, 'VERCEL_OIDC_TOKEN', jwt);
  const linked = required(env, 'PREVIEW_LINKED_CLERK_TOKEN', jwt);
  const unlinked = required(env, 'PREVIEW_UNLINKED_CLERK_TOKEN', jwt);
  if (linked === unlinked) throw new Error('Use different Clerk identities');

  async function check(label, options) {
    const url = new URL('/v1/preview/clerk/session', api);
    url.searchParams.set('organization_id', options.organization ?? tenant);
    if (options.duplicate) url.searchParams.append('organization_id', other);
    const headers = { accept: 'application/json', 'x-vercel-trusted-oidc-idp-token': oidc };
    if (options.token) headers.authorization = 'Bearer ' + options.token;
    if (options.method === 'OPTIONS') {
      headers.origin = app;
      headers['access-control-request-method'] = 'GET';
      headers['access-control-request-headers'] = 'authorization';
    }
    let status;
    try {
      const response = await request(url, {
        headers, method: options.method ?? 'GET', redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      status = response.status;
      const json = await response.json();
      const expectedBody = status === 200
        ? json.principalId === principal && json.organizationId === tenant
        : json.error?.code === options.error;
      if (status === options.status && expectedBody &&
          response.headers.get('cache-control')?.includes('no-store') &&
          !response.headers.has('access-control-allow-origin')) {
        report(`PASS ${label} (${status})`);
        return;
      }
    } catch {
      // A protection page or transport failure cannot count as an application denial.
    }
    throw new Error(`FAIL ${label} (HTTP ${status ?? 'unavailable'})`);
  }

  await check('linked tenant', { token: linked, status: 200 });
  await check('unlinked identity', { token: unlinked, status: 401, error: 'authentication_required' });
  await check('other tenant', { token: linked, organization: other, status: 401, error: 'authentication_required' });
  await check('workload token alone', { status: 401, error: 'authentication_required' });
  await check('duplicate organization', { token: linked, duplicate: true, status: 422, error: 'validation_failed' });
  await check('browser preflight', { method: 'OPTIONS', status: 403, error: 'forbidden' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runClerkPreviewHttp(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
