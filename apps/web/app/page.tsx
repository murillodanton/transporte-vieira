import { headers } from 'next/headers';
import { currentUser, needsSetup } from '@/lib/auth';
import { getStore } from '@vieira/database';
import { Dashboard } from '@/components/dashboard';
import { Access } from '@/components/access';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function Page() {
  const user = await currentUser(await headers());
  if (!user) return <Access setup={needsSetup()} />;
  return <Dashboard user={user} initial={getStore().snapshot(user.role === 'admin')} />;
}
