export const STAGED_CLERK_PRODUCTION_ISSUER = 'https://clerk.neptlium.com';

export interface StagedClerkProductionIdentityStore {
  resolveTenant(issuer: string, subject: string, organizationId: string): Promise<string | null>;
}

export interface StagedClerkProductionSessionAuthority {
  isActiveSession(issuer: string, subject: string, sessionId: string): Promise<boolean>;
}

export class SupabaseStagedClerkProductionIdentityStore implements StagedClerkProductionIdentityStore {
  constructor(
    private readonly origin: string,
    private readonly serviceKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || !serviceKey) {
      throw new Error('Staged identity storage is not configured');
    }
  }

  async resolveTenant(issuer: string, subject: string, organizationId: string): Promise<string | null> {
    if (issuer !== STAGED_CLERK_PRODUCTION_ISSUER) return null;
    const response = await this.request(
      `${this.origin}/rest/v1/rpc/resolve_staged_clerk_production_tenant`,
      {
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
      },
    );
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return typeof value === 'string' ? value : null;
  }
}

/** The server-side key must be independently verified against the approved instance before release. */
export class ClerkStagedProductionSessionAuthority implements StagedClerkProductionSessionAuthority {
  constructor(
    private readonly productionKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!/^sk_live_[A-Za-z0-9_-]+$/.test(productionKey)) {
      throw new Error('Staged Clerk session authority is not configured');
    }
  }

  async isActiveSession(issuer: string, subject: string, sessionId: string): Promise<boolean> {
    if (issuer !== STAGED_CLERK_PRODUCTION_ISSUER || !/^sess_[A-Za-z0-9]{8,128}$/.test(sessionId)) return false;
    const response = await this.request(`https://api.clerk.com/v1/sessions/${sessionId}`, {
      redirect: 'error',
      cache: 'no-store',
      headers: { authorization: `Bearer ${this.productionKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return false;
    const session = data as Record<string, unknown>;
    return session.id === sessionId && session.user_id === subject && session.status === 'active' && session.actor == null &&
      typeof session.expire_at === 'number' && Number.isSafeInteger(session.expire_at) &&
      session.expire_at > Date.now();
  }
}
