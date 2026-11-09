'use client';

import { useEffect, useRef, useState } from 'react';

import { formatDateTime } from '@/lib/format';
import { useMarkAllRead, useNotifications } from '@/lib/queries';

/** A bell with the unread count, opening a list of recent notifications. */
export function NotificationsMenu() {
  const { data } = useNotifications();
  const markAllRead = useMarkAllRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.meta.unread ?? 0;

  // Close when clicking anywhere outside the menu.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {data?.data.length ? (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {data.data.map((n) => (
                <li key={n.id} className={`px-4 py-3 text-sm ${n.readAt ? 'text-slate-500' : ''}`}>
                  <p>{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
