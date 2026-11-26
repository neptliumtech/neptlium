import Link from 'next/link';
import { ArrowRight, UserRound } from 'lucide-react';
import type { AccountStatus } from '@/lib/api/client';
import { accountSetupPrompt } from '@/lib/account/identity-verification';

/** Non-blocking first-run guidance. The dashboard never redirects to onboarding. */
export function AccountSetupPrompt({ status }: { readonly status: AccountStatus | null }) {
  const prompt = accountSetupPrompt(status);
  if (!prompt) return null;
  return (
    <section className="op-panel" aria-labelledby="account-setup-heading">
      <div className="op-state-focus">
        <UserRound size={20} aria-hidden="true" />
        <div>
          <strong id="account-setup-heading">{prompt.title}</strong>
          <p>{prompt.detail}</p>
        </div>
      </div>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-text-secondary">
        <li>Sign in to Neptlium <span className="text-text-muted">· Complete</span></li>
        <li>
          Complete your Capital profile
          {status?.onboarding.state === 'IN_PROGRESS' ? (
            <span className="text-text-muted"> · In progress</span>
          ) : null}
        </li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link className="op-button op-button-primary" href="/onboarding">
          {prompt.cta} <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <a className="op-button" href="#capital-overview">Explore the dashboard</a>
      </div>
    </section>
  );
}
