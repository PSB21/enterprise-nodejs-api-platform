'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Header } from '@/components/header';
import { NotificationsMenu } from '@/components/notifications-menu';
import { Spinner } from '@/components/ui';
import { useAppSelector } from '@/store';

/**
 * Every page in this group needs a logged-in user. This is a convenience for the interface
 * only: the real protection is the API, which checks the token on every request.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  return (
    <>
      <Header notifications={<NotificationsMenu />} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
