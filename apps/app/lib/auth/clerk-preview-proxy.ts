import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { clerkPreviewConfig, clerkPreviewPaths, isClerkPreviewPath } from './clerk-preview-config';

export function refreshClerkPreviewSession(request: NextRequest, event: NextFetchEvent) {
  const preview = clerkPreviewConfig();
  if (!preview || !isClerkPreviewPath(request.nextUrl.pathname) ||
      request.nextUrl.origin !== preview.appOrigin) {
    return new NextResponse(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  return clerkMiddleware({
    publishableKey: preview.publishableKey,
    authorizedParties: [preview.appOrigin],
    signInUrl: clerkPreviewPaths.signIn,
    signUpUrl: clerkPreviewPaths.signUp,
  })(request, event);
}
