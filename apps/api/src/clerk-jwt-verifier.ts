import { createPublicKey, verify as verifySignature } from 'node:crypto';

/**
 * Independent, offline RS256 JWT verification for the preview API.
 * Caller MUST additionally resolve the verified subject to an active principal.
 * This function is not wired into production authentication.
 */
export interface ClerkJwtTrust {
  readonly issuer: string;
  readonly audience: string;
  readonly authorizedParties: readonly string[];
  readonly keys: Readonly<Record<string, JsonWebKey>>;
  readonly nowSeconds?: number;
  readonly sessionMaxAgeSeconds?: number;
  readonly maxTokenLifetimeSeconds?: number;
}

export type ClerkJwtVerification =
  | { readonly valid: true; readonly subject: string; readonly sessionId?: undefined }
  | { readonly valid: true; readonly subject: string; readonly sessionId: string; readonly expiresAt: number }
  | { readonly valid: false };

function decodePart(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid base64url');
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) throw new Error('invalid base64url');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function clerkJwtKeyId(token: string): string | undefined {
  try {
    const header = decodePart(token.split('.', 1)[0]!);
    if (object(header) && header.alg === 'RS256' && header.typ === 'JWT' &&
        typeof header.kid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(header.kid)) {
      return header.kid;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function exactAudience(value: unknown, expected: string): boolean {
  return typeof value === 'string'
    ? value === expected
    : Array.isArray(value) && value.length === 1 && value[0] === expected;
}

/**
 * Fail closed on malformed tokens, untrusted keys, unsupported algorithms,
 * missing claims, invalid signatures and time constraints.
 * Key rotation must be managed by a separate trusted JWKS refresh mechanism.
 */
export function verifyClerkJwtRs256(
  token: string,
  trust: ClerkJwtTrust,
): ClerkJwtVerification {
  const denied: ClerkJwtVerification = { valid: false };
  if (!trust.issuer.startsWith('https://') || !trust.audience ||
      !Number.isFinite(trust.nowSeconds ?? Math.floor(Date.now() / 1000)) ||
      !Array.isArray(trust.authorizedParties) || trust.authorizedParties.length === 0 ||
      trust.authorizedParties.some((origin) => { try { const url = new URL(origin); return url.origin !== origin || url.protocol !== 'https:'; } catch { return true; } }) ||
      token.length > 16384) return denied;
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((part) => !part)) return denied;
  try {
    const header = decodePart(segments[0]!);
    const claims = decodePart(segments[1]!);
    if (!object(header) || !object(claims)) return denied;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        header.typ !== 'JWT') return denied;
    // This verifier supports no JOSE critical extensions.
    if (Object.hasOwn(header, 'crit')) return denied;
    const key = Object.hasOwn(trust.keys, header.kid) ? trust.keys[header.kid] : undefined;
    if (!key || key.kty !== 'RSA' || key.alg !== 'RS256' || key.use !== 'sig') return denied;
    const now = trust.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (claims.iss !== trust.issuer ||
        !exactAudience(claims.aud, trust.audience) ||
        typeof claims.azp !== 'string' || !trust.authorizedParties.includes(claims.azp) ||
        typeof claims.sub !== 'string' ||
        !/^user_[A-Za-z0-9]{8,128}$/.test(claims.sub) ||
        typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || now >= claims.exp ||
        typeof claims.nbf !== 'number' || !Number.isSafeInteger(claims.nbf) || now < claims.nbf ||
        typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat > now) return denied;
    if (claims.exp <= claims.iat || claims.exp <= claims.nbf) return denied;
    const maxLifetime = trust.maxTokenLifetimeSeconds;
    if (maxLifetime !== undefined &&
        (!Number.isSafeInteger(maxLifetime) || maxLifetime <= 0 || claims.exp - claims.iat > maxLifetime)) return denied;
    const maxAge = trust.sessionMaxAgeSeconds;
    const sessionId = claims.sid;
    if (maxAge !== undefined &&
        (!Number.isSafeInteger(maxAge) || maxAge <= 0 || now - claims.iat >= maxAge ||
          claims.exp - claims.iat > maxAge ||
          typeof sessionId !== 'string' || !/^sess_[A-Za-z0-9]{8,128}$/.test(sessionId))) return denied;
    const publicKey = createPublicKey({ key, format: 'jwk' });
    const signature = Buffer.from(segments[2]!, 'base64url');
    if (publicKey.asymmetricKeyType !== 'rsa' ||
        (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
        signature.toString('base64url') !== segments[2]!) return denied;
    if (!verifySignature('RSA-SHA256', Buffer.from(segments[0] + '.' + segments[1]), publicKey, signature)) return denied;
    return maxAge !== undefined && typeof sessionId === 'string'
      ? { valid: true, subject: claims.sub, sessionId, expiresAt: claims.exp }
      : { valid: true, subject: claims.sub };
  } catch {
    return denied;
  }
}
