const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_KEYS = 32;
const RETRY_DELAY_MS = 5_000;
const KEY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MODULUS = /^[A-Za-z0-9_-]{342,683}$/;
const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];

type SigningKeys = Readonly<Record<string, JsonWebKey>>;

async function readJwks(response: Response, endpoint: string): Promise<unknown> {
  if (response.status !== 200 || !response.body) throw new Error('Clerk JWKS unavailable');
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (response.redirected || (response.url && response.url !== endpoint) ||
      response.headers.has('content-range') ||
      (mediaType !== 'application/json' && mediaType !== 'application/jwk-set+json')) {
    void response.body.cancel().catch(() => undefined);
    throw new Error('Invalid Clerk JWKS response');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let json = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(json + decoder.decode()) as unknown;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error('Clerk JWKS response too large');
      json += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function signingKeys(document: unknown): SigningKeys {
  const entries = (document as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(entries) || entries.length > MAX_KEYS) throw new Error('Invalid Clerk JWKS');
  const keys: Record<string, JsonWebKey> = Object.create(null);
  for (const entry of entries) {
    if (!entry || entry.kty !== 'RSA' || entry.alg !== 'RS256' || entry.use !== 'sig' ||
        PRIVATE_FIELDS.some(field => Object.hasOwn(entry, field)) ||
        (Object.hasOwn(entry, 'key_ops') &&
          (!Array.isArray(entry.key_ops) || entry.key_ops.length !== 1 || entry.key_ops[0] !== 'verify'))) {
      throw new Error('Invalid Clerk signing key');
    }
    const { kid, n, e } = entry;
    if (typeof kid !== 'string' || !KEY_ID.test(kid) || Object.hasOwn(keys, kid) ||
        typeof n !== 'string' || !MODULUS.test(n) || e !== 'AQAB') {
      throw new Error('Invalid Clerk signing key');
    }
    const modulus = Buffer.from(n, 'base64url');
    if (modulus.toString('base64url') !== n || modulus.length < 256 || modulus.length > 512 ||
        modulus[0] === 0 || (modulus.length === 256 && modulus[0]! < 128) ||
        (modulus[modulus.length - 1]! & 1) === 0) {
      throw new Error('Invalid Clerk RSA modulus');
    }
    keys[kid] = Object.freeze({ kty: 'RSA', alg: 'RS256', use: 'sig', n, e });
  }
  if (Object.keys(keys).length === 0) throw new Error('Clerk JWKS contains no signing keys');
  return Object.freeze(keys);
}

/** Use a server-configured Clerk issuer. Token claims never select the endpoint. */
export function createClerkSigningKeyLoader(
  issuer: string,
  request: typeof fetch = fetch,
  now: () => number = () => performance.now(),
): () => Promise<SigningKeys> {
  const origin = new URL(issuer);
  if (origin.protocol !== 'https:' || origin.origin !== issuer || origin.port) throw new Error('Invalid Clerk issuer origin');
  const endpoint = new URL('/.well-known/jwks.json', origin);

  let cached: { keys: SigningKeys; expiresAt: number } | undefined;
  let retryAt = 0;
  let pending: Promise<SigningKeys> | undefined;

  async function refresh(): Promise<SigningKeys> {
    // The independent deadline also covers injected transports that ignore abort.
    // Cache mutation happens only after the bounded operation succeeds.
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Clerk JWKS unavailable: timeout')), FETCH_TIMEOUT_MS);
    });
    try {
      const keys = await Promise.race([
        (async () => {
          const response = await request(new URL(endpoint), {
            redirect: 'error',
            cache: 'no-store',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          return signingKeys(await readJwks(response, endpoint.href));
        })(),
        timeout,
      ]);
      cached = { keys, expiresAt: now() + CACHE_TTL_MS };
      return keys;
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }

  return async () => {
    if (cached && now() < cached.expiresAt) return cached.keys;
    if (now() < retryAt) throw new Error('Clerk JWKS unavailable');
    pending ??= refresh().catch(error => {
      retryAt = now() + RETRY_DELAY_MS;
      throw error;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
