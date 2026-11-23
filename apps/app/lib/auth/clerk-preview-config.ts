const PREVIEW_ROOT = '/preview/clerk';
const productionOrigins = new Set([
  'https://app.neptlium.com',
  'https://api.neptlium.com',
  'https://neptlium-app.vercel.app',
  'https://neptlium-api.vercel.app',
]);

export const clerkPreviewPaths = {
  root: PREVIEW_ROOT,
  signIn: `${PREVIEW_ROOT}/sign-in`,
  signUp: `${PREVIEW_ROOT}/sign-up`,
  dashboard: `${PREVIEW_ROOT}/dashboard`,
};

export function isClerkPreviewPath(pathname: string) {
  return pathname === PREVIEW_ROOT || pathname.startsWith(`${PREVIEW_ROOT}/`);
}

function httpsOrigin(value: string | undefined) {
  if (!value) return undefined;
  const url = URL.parse(value);
  return url?.protocol === 'https:' && url.origin === value ? value : undefined;
}

function isDevelopmentPublishableKey(key: string): boolean {
  if (!/^pk_test_[A-Za-z0-9+/]+={0,2}$/.test(key)) return false;
  const frontendApi = Buffer.from(key.slice('pk_test_'.length), 'base64').toString('utf8');
  return /^[a-z0-9-]+\.clerk\.accounts\.dev\$$/.test(frontendApi);
}

export function clerkPreviewConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_TARGET_ENV === 'production' ||
      env.NEPTLIUM_API_AUTH_PROVIDER !== 'clerk-preview') return undefined;
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = env.CLERK_SECRET_KEY;
  const appOrigin = httpsOrigin(env.NEPTLIUM_CLERK_PREVIEW_APP_ORIGIN);
  const apiOrigin = httpsOrigin(env.NEPTLIUM_CLERK_PREVIEW_API_ORIGIN);
  const template = env.NEPTLIUM_CLERK_PREVIEW_TOKEN_TEMPLATE?.trim();
  if (!publishableKey || !isDevelopmentPublishableKey(publishableKey) ||
      !secretKey || !/^sk_test_[A-Za-z0-9_-]+$/.test(secretKey) ||
      !appOrigin || productionOrigins.has(appOrigin)) return undefined;
  if (!apiOrigin || !template || appOrigin === apiOrigin || productionOrigins.has(apiOrigin)) return undefined;
  const trustedSource = env.NEPTLIUM_CLERK_PREVIEW_VERCEL_TRUSTED_SOURCE;
  if (trustedSource !== undefined && trustedSource !== 'true' && trustedSource !== 'false') return undefined;
  if (trustedSource === 'true' && !/^https:\/\/[a-z0-9-]+-neptliumforge\.vercel\.app$/.test(apiOrigin)) return undefined;
  return { publishableKey, appOrigin, api: { origin: apiOrigin, template, trustedSource: trustedSource === 'true' } };
}
