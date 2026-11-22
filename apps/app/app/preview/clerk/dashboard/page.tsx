import { SignOutButton } from '@clerk/nextjs';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { clerkPreviewConfig, clerkPreviewPaths } from '@/lib/auth/clerk-preview-config';
import { resolvePreviewClerkApiSession } from '@/lib/auth/preview-clerk-api-session';

export default async function PreviewClerkDashboard({
  searchParams,
}: {
  readonly searchParams: Promise<{ organization_id?: string | string[] }>;
}) {
  const config = clerkPreviewConfig();
  if (!config) notFound();

  const session = await auth().catch(() => null);
  if (session && !session.userId) redirect(clerkPreviewPaths.signIn);

  const activeSession = session?.userId && session.sessionId
    ? await clerkClient()
        .then((client) => client.sessions.getSession(session.sessionId))
        .catch(() => null)
    : null;
  if (activeSession && (activeSession.status !== 'active' || activeSession.userId !== session?.userId ||
      activeSession.id !== session?.sessionId)) {
    redirect(clerkPreviewPaths.signIn);
  }

  const { organization_id: organization } = await searchParams;
  const tenant = typeof organization === 'string' ? organization : undefined;
  const api = config.api;
  const verified = session && activeSession && tenant
    ? await resolvePreviewClerkApiSession(tenant, {
        environment: 'preview',
        apiProvider: 'clerk-preview',
        apiOrigin: api.origin,
        getSessionToken: () => session.getToken({ template: api.template }),
      })
    : null;

  return (
    <>
      {verified ? (
        <section>
          <h1>Preview dashboard</h1>
          <p>Organization access verified.</p>
        </section>
      ) : (
        <>
          <h1>Verify organization access</h1>
          {!activeSession && <p role="status">The authentication service is unavailable. Try again shortly.</p>}
          {activeSession && (
            <>
              <form method="get" action={clerkPreviewPaths.dashboard}>
                <label htmlFor="organization_id">Organization ID</label>
                <input id="organization_id" name="organization_id" required />
                <button type="submit">Verify access</button>
              </form>
              {organization !== undefined && (
                <p role="status">Organization access could not be verified.</p>
              )}
            </>
          )}
        </>
      )}
      {session?.userId && (
        <SignOutButton redirectUrl={clerkPreviewPaths.signIn}>
          <button type="button">Sign out</button>
        </SignOutButton>
      )}
    </>
  );
}
