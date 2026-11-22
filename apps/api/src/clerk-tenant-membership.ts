import { ApiError } from './errors.js';

export const IDENTITY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClerkTenantMembershipStore {
  resolveActiveTenantPrincipal(issuer: string, subject: string, organizationId: string): Promise<string | null>;
}

/** Membership evidence only. Governed commands enforce role, ownership and policy. */
export class SupabaseClerkTenantMembershipStore implements ClerkTenantMembershipStore {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    const origin = URL.parse(url);
    if (!origin || origin.protocol !== 'https:' || origin.origin !== url || !serviceKey) {
      throw new Error('tenant membership store is not configured');
    }
  }

  async resolveActiveTenantPrincipal(issuer: string, subject: string, organizationId: string): Promise<string | null> {
    if (!IDENTITY_UUID.test(organizationId) || !/^user_[A-Za-z0-9]{8,128}$/.test(subject)) return null;
    try {
      const response = await this.request(`${this.url}/rest/v1/rpc/resolve_staged_clerk_production_tenant`, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        headers: {
          apikey: this.serviceKey,
          authorization: `Bearer ${this.serviceKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_issuer: issuer, p_subject: subject, p_organization_id: organizationId }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const principal: unknown = await response.json();
        if (principal === null || (typeof principal === 'string' && IDENTITY_UUID.test(principal))) return principal;
      }
    } catch {
      // Normalize transport and response parsing failures.
    }
    throw new ApiError(503, 'identity_storage_unavailable', 'Identity storage is unavailable');
  }
}
