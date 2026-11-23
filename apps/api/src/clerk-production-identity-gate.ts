import { createClerkSigningKeyLoader } from './clerk-jwks.js';
import { clerkJwtKeyId, verifyClerkJwtRs256 } from './clerk-jwt-verifier.js';
import { IDENTITY_UUID, type ClerkTenantMembershipStore } from './clerk-tenant-membership.js';

/** Release composition must supply a Clerk instance-bound, authoritative session check. */
export interface ClerkSessionAuthority {
  readonly issuer: string;
  isActiveSession(sessionId: string, subject: string): Promise<boolean>;
}

const STAGED_CLERK_PRODUCTION_ISSUER = 'https://clerk.neptlium.com';
const CUSTOMER_ORIGIN = 'https://app.neptlium.com';
const CUSTOMER_AUDIENCE = 'neptlium-api';
const SESSION_MAX_AGE_SECONDS = 120;

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Staged identity and membership gate. Route registration is separate release work.
 * Governed routes enforce their own authorization and ledger invariants.
 */
export function createClerkProductionIdentityGate(
  env: Environment,
  store: ClerkTenantMembershipStore,
  sessions: ClerkSessionAuthority,
  request: typeof fetch = fetch,
) {
  const issuer = env.NEPTLIUM_CLERK_PRODUCTION_ISSUER;
  const origin = issuer && URL.parse(issuer);
  if (env.NODE_ENV !== 'production' || env.VERCEL_ENV !== 'production' ||
      env.NEPTLIUM_AUTH_PROVIDER !== 'clerk' ||
      env.NEPTLIUM_CLERK_CUTOVER_APPROVED !== 'true' ||
      env.NEPTLIUM_IDENTITY_MAPPING_VERIFIED !== 'true' ||
      env.NEPTLIUM_AUTH_ROLLBACK_VERIFIED !== 'true' ||
      env.NEPTLIUM_CLERK_JWT_VERIFIER_VERIFIED !== 'true' ||
      env.NEPTLIUM_CLERK_TENANT_ISOLATION_VERIFIED !== 'true' ||
      env.NEPTLIUM_CLERK_ACCOUNT_BOOTSTRAP_VERIFIED !== 'true' ||
      env.NEXT_PUBLIC_SITE_URL !== CUSTOMER_ORIGIN ||
      env.NEPTLIUM_CLERK_PRODUCTION_AUDIENCE !== CUSTOMER_AUDIENCE ||
      !origin || !sessions || sessions.issuer !== issuer || typeof sessions.isActiveSession !== 'function' ||
      origin.protocol !== 'https:' || origin.origin !== issuer || origin.port ||
      issuer !== STAGED_CLERK_PRODUCTION_ISSUER) return undefined;

  const loadKeys = createClerkSigningKeyLoader(origin.origin, request);

  return async (bearerToken: string, organizationId: string) => {
    if (!IDENTITY_UUID.test(organizationId) || bearerToken.length > 16_384 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearerToken)) return null;

    const tenant = organizationId.toLowerCase();
    try {
      const kid = clerkJwtKeyId(bearerToken);
      if (!kid) return null;
      const result = verifyClerkJwtRs256(bearerToken, {
        issuer: origin.origin,
        audience: CUSTOMER_AUDIENCE,
        authorizedParties: [CUSTOMER_ORIGIN],
        keys: await loadKeys(kid),
        sessionMaxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      });
      if (!result.valid || !result.sessionId ||
          await sessions.isActiveSession(result.sessionId, result.subject) !== true) return null;
      const principal = await store.resolveActiveTenantPrincipal(origin.origin, result.subject, tenant);
      if (!principal || !IDENTITY_UUID.test(principal) || Date.now() >= result.expiresAt * 1000) return null;
      return { principalId: principal, organizationId: tenant };
    } catch {
      return null;
    }
  };
}
