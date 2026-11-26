import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ApiClientError } from '@/lib/api/client';
import { getCurrentProfile } from '@/lib/auth/session';
import { getOnboardingReturnPath } from '@/lib/auth/return-context';
import { OnboardingWizard } from './OnboardingWizard';

export default async function OnboardingPage() {
  const user = await requireUser();
  const returnTo = await getOnboardingReturnPath();
  let profile;
  try {
    profile = await getCurrentProfile(user);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status < 500) throw error;
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="np-h3 text-text-primary">Capital setup is unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          We couldn’t check your Capital profile. Try again in a moment or return to your dashboard.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="op-button op-button-primary" href={'/onboarding?next=' + encodeURIComponent(returnTo)}>Try again</a>
          <a className="op-button" href="/dashboard">Back to dashboard</a>
        </div>
      </main>
    );
  }
  if (profile?.provisionedAt) redirect(returnTo);

  return <OnboardingWizard email={user.email ?? 'Verified account'} returnTo={returnTo} />;
}
