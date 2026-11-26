import 'server-only';

import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@neptlium/lib/supabase/server';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

function apiOrigin(): string {
  const configured = process.env.NEPTLIUM_API_URL;
  if (!configured) throw new AdminApiError(503, 'api_not_configured', 'The Neptlium API is not configured.');
  const url = new URL(configured);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new AdminApiError(503, 'invalid_api_origin', 'The Neptlium API origin is invalid.');
  }
  if (process.env.VERCEL_ENV === 'preview' && (
    url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.port ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') !== 'https://ntbaoylcrwkowqqvzkno.supabase.co'
  )) {
    throw new AdminApiError(503, 'invalid_preview_binding', 'The Preview API binding is invalid.');
  }
  return url.origin;
}

async function execute<T>(token: string, path: `/v1/admin${string}`, init: RequestInit = {}): Promise<T> {
  const origin = apiOrigin();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.delete('x-vercel-protection-bypass');
  if (process.env.VERCEL_ENV === 'preview') {
    const bypass = process.env.NEPTLIUM_PREVIEW_API_BYPASS_SECRET;
    if (!bypass) throw new AdminApiError(503, 'preview_api_not_configured', 'The protected Preview API is not configured.');
    headers.set('x-vercel-protection-bypass', bypass);
  }
  headers.set('authorization', `Bearer ${token}`);
  const requestId = randomUUID();
  headers.set('x-request-id', requestId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${origin}${path}`, {
      ...init,
      method: (init.method ?? 'GET').toUpperCase(),
      cache: 'no-store',
      headers,
      ...(process.env.VERCEL_ENV === 'preview' ? { redirect: 'error' } : {}),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: { code?: string; message?: string };
      request_id?: string;
    };
    if (!response.ok) {
      throw new AdminApiError(
        response.status,
        payload.error?.code ?? 'api_error',
        payload.error?.message ?? 'The administrative API request failed.',
        payload.request_id ?? response.headers.get('x-request-id') ?? requestId,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    throw new AdminApiError(
      503,
      timedOut ? 'api_timeout' : 'api_unavailable',
      timedOut ? 'The administrative API request timed out.' : 'The administrative API is unavailable.',
      requestId,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function adminApiRequestWithToken<T>(
  token: string,
  path: `/v1/admin${string}`,
  init: RequestInit = {},
): Promise<T> {
  return execute<T>(token, path, init);
}

export async function adminApiRequest<T>(
  path: `/v1/admin${string}`,
  init: RequestInit = {},
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new AdminApiError(401, 'session_expired', 'Your session has expired.');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new AdminApiError(401, 'session_expired', 'Your session has expired.');
  return execute<T>(token, path, init);
}
