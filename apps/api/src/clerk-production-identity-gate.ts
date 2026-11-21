import { createClerkSigningKeyLoader } from './clerk-jwks.js';
import { verifyClerkJwtRs256 } from './clerk-jwt-verifier.js';
import {
  STAGED_CLERK_PRODUCTION_ISSUER,
  type StagedClerkProductionIdentityStore,
  type StagedClerkProductionSessionAuthority,
} from './staged-clerk-production-identity.js';

const CUSTOMER_ORIGIN = 'https://app.neptlium.com';
const CUSTOMER_AUDIENCE = 'neptlium-api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Staged production identity boundary. Route registration is separate release work. The result conveys identity and membership.
 * Financial routes still require their own authorization and ledger invariants.
 */
export function createClerkProductionIdentityGate(
  env: Environment,
  store: StagedClerkProductionIdentityStore,
  sessions: StagedClerkProductionSessionAuthority,
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
      !origin || origin.protocol !== 'https:' || origin.origin !== issuer || origin.port ||
      issuer !== STAGED_CLERK_PRODUCTION_ISSUER) return undefined;

  const loadKeys = createClerkSigningKeyLoader(origin.origin, request);

  return async (bearerToken: string, organizationId: string) => {
    if (!UUID.test(organizationId) || bearerToken.length > 16_384 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearerToken)) return null;

    const tenant = organizationId.toLowerCase();
    try {
      const result = verifyClerkJwtRs256(bearerToken, {
        issuer: origin.origin,
        audience: CUSTOMER_AUDIENCE,
        authorizedParties: [CUSTOMER_ORIGIN],
        keys: await loadKeys(),
        requireSession: true,
      });
      if (!result.valid || !result.sessionId || result.expiresAt === undefined) return null;
      if (await sessions.isActiveSession(origin.origin, result.subject, result.sessionId) !== true) return null;
      const principal = await store.resolveTenant(origin.origin, result.subject, tenant);
      if (!principal || !UUID.test(principal) || Date.now() >= result.expiresAt * 1000) return null;
      return { principalId: principal, organizationId: tenant };
    } catch {
      return null;
    }
  };
}
