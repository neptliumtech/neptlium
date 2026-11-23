import { clerkApiReadiness } from './clerk-token-boundary.js';
import { createClerkPreviewAuthorizer } from './clerk-preview-middleware.js';
import { SupabaseClerkPreviewIdentityStore } from './clerk-preview-identity.js';

// Neptlium Dev is the approved hosted data boundary for this Preview flow.
const PREVIEW_SUPABASE_URL = 'https://ntbaoylcrwkowqqvzkno.supabase.co';

function httpsOrigin(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const url = URL.parse(input);
  return url?.protocol === 'https:' && url.origin === input ? input : undefined;
}

export function clerkPreviewRouteConfig(env: Readonly<Record<string, string | undefined>>) {
  if (!clerkApiReadiness(env).ready || env.VERCEL_TARGET_ENV === 'production') return undefined;
  const issuer = httpsOrigin(env.NEPTLIUM_CLERK_PREVIEW_ISSUER);
  const audience = env.NEPTLIUM_CLERK_PREVIEW_AUDIENCE?.trim();
  const authorizedParty = httpsOrigin(env.NEPTLIUM_CLERK_PREVIEW_APP_ORIGIN);
  const databaseUrl = httpsOrigin(env.NEPTLIUM_CLERK_PREVIEW_SUPABASE_URL);
  const databaseKey = env.NEPTLIUM_CLERK_PREVIEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev$/.test(issuer) ||
      !audience || !authorizedParty ||
      authorizedParty === 'https://app.neptlium.com' || authorizedParty === 'https://neptlium-app.vercel.app' ||
      databaseUrl !== PREVIEW_SUPABASE_URL || !databaseKey?.trim() ||
      (env.SUPABASE_URL && URL.parse(env.SUPABASE_URL)?.origin !== PREVIEW_SUPABASE_URL)) return undefined;
  return { issuer, audience, authorizedParty, databaseUrl, databaseKey };
}

export function createClerkPreviewSessionRoute(
  config: ReturnType<typeof clerkPreviewRouteConfig>,
  request: typeof fetch = fetch,
) {
  if (!config) return undefined;
  const store = new SupabaseClerkPreviewIdentityStore(config.databaseUrl, config.databaseKey, request);
  const authorize = createClerkPreviewAuthorizer({
    issuer: config.issuer,
    audience: config.audience,
    authorizedParties: [config.authorizedParty],
    maxTokenLifetimeSeconds: 120,
  }, store, request);
  return (headers: Readonly<Record<string, string | undefined>>, organizationId: string) =>
    authorize(headers, organizationId.toLowerCase(), 'preview');
}
