import { ApiError } from './errors.js';
import { verifyClerkJwtRs256, type ClerkJwtTrust } from './clerk-jwt-verifier.js';

/**
 * Preview-only composition boundary. It is deliberately not registered with
 * the production request authenticator. Existing principals are never created
 * or linked here.
 */
export interface ClerkPreviewIdentityStore {
  resolveActiveTenantPrincipal(issuer: string, subject: string, organizationId: string): Promise<string | null>;
}

export class SupabaseClerkPreviewIdentityStore implements ClerkPreviewIdentityStore {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (URL.parse(url)?.origin !== url || !url.startsWith('https://') || !serviceKey) throw new Error('preview identity store is not configured');
  }

  private async rows(path: string): Promise<unknown[]> {
    let response: Response;
    try {
      response = await this.request(`${this.url}/rest/v1/${path}`, {
        headers: { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}` },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ApiError(503, 'identity_storage_unavailable', 'Identity storage is unavailable');
    }
    if (!response.ok) throw new ApiError(503, 'identity_storage_unavailable', 'Identity storage is unavailable');
    const data: unknown = await response.json().catch(() => null);
    if (!Array.isArray(data)) throw new ApiError(503, 'identity_storage_unavailable', 'Invalid identity storage response');
    return data;
  }

  async resolveActiveTenantPrincipal(issuer: string, subject: string, organizationId: string): Promise<string | null> {
    if (!/^user_[A-Za-z0-9]{8,128}$/.test(subject) || !UUID.test(organizationId)) return null;

    // Read every authorization predicate in one database snapshot. Separate
    // requests could combine a revoked link with a newly activated membership.
    const query = new URLSearchParams({
      select: 'id,status,suspended_at,retired_at,' +
        'clerk:identity_provider_subjects!inner(provider,provider_subject,clerk_issuer,status,revoked_at),' +
        'legacy:identity_provider_subjects!inner(provider,provider_subject,status,revoked_at),' +
        'memberships:organization_memberships!inner(organization_id,user_id,status,suspended_at,revoked_at)',
      status: 'eq.ACTIVE',
      suspended_at: 'is.null',
      retired_at: 'is.null',
      'clerk.provider': 'eq.CLERK',
      'clerk.provider_subject': `eq.${subject}`,
      'clerk.clerk_issuer': `eq.${issuer}`,
      'clerk.status': 'eq.ACTIVE',
      'clerk.revoked_at': 'is.null',
      'legacy.provider': 'eq.SUPABASE_AUTH',
      'legacy.status': 'eq.ACTIVE',
      'legacy.revoked_at': 'is.null',
      'memberships.organization_id': `eq.${organizationId}`,
      'memberships.status': 'eq.active',
      'memberships.suspended_at': 'is.null',
      'memberships.revoked_at': 'is.null',
      limit: '2',
    });
    const rows = await this.rows(`identity_principals?${query}`);
    if (rows.length !== 1) return null;
    const principal = rows[0] as {
      id?: unknown;
      status?: unknown;
      suspended_at?: unknown;
      retired_at?: unknown;
      clerk?: unknown;
      legacy?: unknown;
      memberships?: unknown;
    } | null;
    if (typeof principal?.id !== 'string' || !UUID.test(principal.id) ||
        principal.status !== 'ACTIVE' || principal.suspended_at !== null || principal.retired_at !== null) return null;

    const clerk = singleRow(principal.clerk);
    const legacy = singleRow(principal.legacy);
    const membership = singleRow(principal.memberships);
    if (clerk?.provider !== 'CLERK' || clerk.provider_subject !== subject ||
        clerk.clerk_issuer !== issuer || clerk.status !== 'ACTIVE' || clerk.revoked_at !== null ||
        legacy?.provider !== 'SUPABASE_AUTH' || legacy.status !== 'ACTIVE' || legacy.revoked_at !== null ||
        typeof legacy.provider_subject !== 'string' || !UUID.test(legacy.provider_subject) ||
        membership?.organization_id !== organizationId || membership.user_id !== legacy.provider_subject ||
        membership.status !== 'active' || membership.suspended_at !== null || membership.revoked_at !== null) return null;
    return principal.id;
  }
}

function singleRow(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const row: unknown = value[0];
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function authenticateClerkPreviewTenant(
  token: string,
  organizationId: string,
  trust: ClerkJwtTrust,
  store: ClerkPreviewIdentityStore,
  environment: string | undefined,
): Promise<{ principalId: string; organizationId: string } | null> {
  if (environment !== 'preview' || !UUID.test(organizationId)) return null;
  const verified = verifyClerkJwtRs256(token, trust);
  if (!verified.valid) return null;
  const principalId = await store.resolveActiveTenantPrincipal(trust.issuer, verified.subject, organizationId);
  if (!principalId || !UUID.test(principalId)) return null;
  return { principalId, organizationId };
}
