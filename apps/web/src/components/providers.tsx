'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import { refreshSession } from '@/lib/session';
import { store } from '@/store';

/** Restores the session from the refresh cookie once, when the app first loads. */
function SessionRestorer() {
  useEffect(() => {
    if (store.getState().auth.status === 'checking') {
      void refreshSession();
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  // Created once per browser tab. useState keeps it stable across re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 4xx errors will not fix themselves, so only retry other failures.
            retry: (count, error) => {
              const status = (error as { response?: { status?: number } }).response?.status;
              return count < 2 && !(status && status >= 400 && status < 500);
            },
          },
        },
      })
  );

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionRestorer />
        {children}
      </QueryClientProvider>
    </Provider>
  );
}
