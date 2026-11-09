'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { logout } from '@/lib/session';
import type { Role } from '@/lib/types';
import { useAppSelector } from '@/store';

const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: '/apis', label: 'APIs' },
  { href: '/requests', label: 'Access requests' },
  { href: '/keys', label: 'API keys', roles: ['DEVELOPER'] },
  { href: '/usage', label: 'Usage' },
];

export function Header({ notifications }: { notifications?: React.ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleLogout() {
    await logout();
    // Drop cached data, so the next user of this browser cannot see it.
    queryClient.clear();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/apis" className="font-semibold text-indigo-600">
          AMS
        </Link>
        <nav className="flex flex-1 flex-wrap gap-1 text-sm">
          {NAV.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 ${active ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {notifications}
          <span className="hidden text-slate-600 sm:inline">{user.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {user.role.toLowerCase()}
          </span>
          <button onClick={handleLogout} className="text-slate-600 hover:text-slate-900">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
