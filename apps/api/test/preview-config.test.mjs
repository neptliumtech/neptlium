import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../dist/config.js';

const env = {
  VERCEL_ENV: 'preview',
  NODE_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: 'preview-commit',
  SUPABASE_URL: 'https://ntbaoylcrwkowqqvzkno.supabase.co/',
  SUPABASE_ANON_KEY: 'test-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'test-server',
  API_ALLOWED_ORIGINS: 'https://app-example.vercel.app,https://admin-example.vercel.app',
};

test('Vercel Preview uses durable Dev Supabase and reports Preview provenance', () => {
  const config = loadConfig(env);
  assert.equal(config.NODE_ENV, 'preview');
  assert.equal(config.API_BUILD_ID, 'preview-commit');
  assert.equal(config.SUPABASE_URL, env.SUPABASE_URL.slice(0, -1));
  assert.equal(config.AUTH_MODE, 'SUPABASE');
  assert.equal(config.databaseConfigured, true);
  assert.equal(config.ENABLE_MAINNET, false);
});

test('Vercel Preview refuses Production bindings and live financial configuration', () => {
  assert.throws(() => loadConfig({
    ...env, SUPABASE_URL: 'https://udghxwlhztwxvkjaefjh.supabase.co',
  }), /Dev Supabase URL/);
  assert.throws(() => loadConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }), /Dev Supabase credentials/);
  assert.throws(() => loadConfig({ ...env, API_ALLOWED_ORIGINS: 'https://app.neptlium.com' }), /explicit Vercel/);
  assert.throws(() => loadConfig({ ...env, ENABLE_MAINNET: 'true' }), /live financial/);
  assert.throws(() => loadConfig({ ...env, STRIPE_WEBHOOK_ENVIRONMENT: 'live' }), /live financial/);
});

test('the Vercel Preview policy leaves the Production config path intact', () => {
  const config = loadConfig({ ...env, VERCEL_ENV: 'production', SUPABASE_URL: 'https://udghxwlhztwxvkjaefjh.supabase.co' });
  assert.equal(config.NODE_ENV, 'production');
  assert.equal(config.SUPABASE_URL, 'https://udghxwlhztwxvkjaefjh.supabase.co');
});
