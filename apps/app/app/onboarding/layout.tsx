import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';

export default async function OnboardingLayout({ children }: { readonly children: ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
