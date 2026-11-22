import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createClerkSigningKeyLoader } from '../dist/clerk-jwks.js';

const issuer = 'https://clerk-preview.example.test';
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), use: 'sig', alg: 'RS256', kid: 'first' };

test('loads issuer keys, shares concurrent fetches and refreshes rotated keys after expiry', async () => {
  const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
  let time = 0;
  let requests = 0;
  const load = createClerkSigningKeyLoader(issuer, async (url, init) => {
    assert.equal(url.href, issuer + '/.well-known/jwks.json');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    requests++;
    return Response.json({ keys: [requests === 1 ? key : { ...key, n: rotated.n, kid: 'second' }] });
  }, () => time);
  const [first, concurrent] = await Promise.all([load(), load()]);
  assert.equal(first, concurrent);
  assert.deepEqual(Object.keys(first), ['first']);
  time = 59_999;
  assert.equal(await load(), first);
  time = 60_000;
  const refreshed = await load();
  assert.deepEqual(Object.keys(refreshed), ['second']);
  assert.equal(refreshed.second.n, rotated.n);
  assert.equal(requests, 2);
});

test('rejects expired keys during an outage and retries after a bounded delay', async () => {
  let time = 0;
  let available = true;
  const load = createClerkSigningKeyLoader(issuer, async () => available
    ? Response.json({ keys: [key] })
    : new Response(null, { status: 503 }), () => time);
  await load();
  time = 60_000;
  available = false;
  await assert.rejects(load, /unavailable/);
  available = true;
  await assert.rejects(load, /unavailable/);
  time = 65_000;
  assert.deepEqual(Object.keys(await load()), ['first']);
});

test('rejects malformed key sets, duplicate key IDs and oversized responses', async () => {
  for (const response of [
    Response.json({ keys: [key, key] }),
    Response.json({ keys: [] }),
    Response.json({ keys: Array(33).fill(key) }),
    Response.json({ keys: [{ ...key, n: undefined }] }),
    Response.json({ keys: [{ ...key, n: Buffer.alloc(256, 1).toString('base64url') }] }),
    Response.json({ keys: [{ ...key, n: Buffer.alloc(256, 0x80).toString('base64url') }] }),
    Response.json({ keys: [{ ...key, n: key.n + '=' }] }),
    Response.json({ keys: [{ ...key, e: 'Ag' }] }),
    Response.json({ keys: [{ ...key, d: 'AQ' }] }),
    Response.json({ keys: [{ ...key, key_ops: ['sign'] }] }),
    Response.json({ keys: [{ ...key, alg: 'RS512' }] }),
    Response.redirect(issuer + '/redirect'),
    new Response(JSON.stringify({ keys: [key] }), { headers: { 'content-type': 'text/html' } }),
    Response.json({ keys: [key] }, { headers: { 'content-range': 'bytes 0-9/20' } }),
    new Response(' '.repeat(65_537), { headers: { 'content-type': 'application/json' } }),
  ]) {
    const load = createClerkSigningKeyLoader(issuer, async () => response);
    await assert.rejects(load, /Clerk/);
  }
});

test('requires an exact HTTPS issuer origin', () => {
  for (const invalid of ['http://example.test', issuer + '/other', 'https://user@example.test']) {
    assert.throws(() => createClerkSigningKeyLoader(invalid), /Invalid Clerk issuer/);
  }
});

test('aborts a stalled response body at the fetch deadline', async () => {
  // AbortSignal.timeout uses an unref'ed timer.
  const keepAlive = setTimeout(() => {}, 7_000);
  try {
    const load = createClerkSigningKeyLoader(issuer, async (_url, { signal }) =>
      new Response(new ReadableStream({
        start(controller) {
          signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        },
      }), { headers: { 'content-type': 'application/jwk-set+json' } }));
    await assert.rejects(load, /timeout/);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('refreshes an unknown rotated key with a shared, rate-limited refresh', async () => {
  let time = 0;
  let requests = 0;
  const load = createClerkSigningKeyLoader(issuer, async () =>
    Response.json({ keys: [{ ...key, kid: ++requests === 1 ? 'first' : 'second' }] }), () => time);
  await load('first');
  await load('second');
  assert.equal(requests, 1);
  time = 5000;
  const [rotated, concurrent] = await Promise.all([load('second'), load('second')]);
  assert.ok(rotated.second);
  assert.equal(rotated, concurrent);
  await load('unknown');
  assert.equal(requests, 2);
});

test('enforces a deadline when a custom request ignores abort', async () => {
  const load = createClerkSigningKeyLoader(issuer, async () => new Promise(() => {}));
  await assert.rejects(load(), /timeout/);
});
