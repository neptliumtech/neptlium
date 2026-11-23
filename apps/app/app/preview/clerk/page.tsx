import { redirect } from 'next/navigation';
import { clerkPreviewPaths } from '@/lib/auth/clerk-preview-config';

export default function Page() {
  redirect(clerkPreviewPaths.dashboard);
}
