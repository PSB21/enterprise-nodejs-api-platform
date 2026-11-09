'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './session';
import type {
  AccessRequest,
  Api,
  ApiKey,
  ApiStatus,
  ApiUsageSummary,
  AppNotification,
  MyUsage,
  Paged,
  PageMeta,
  RequestStatus,
  UsageSeries,
} from './types';

// Query keys name each piece of cached data. Mutations invalidate them, so lists refetch
// after a change instead of showing stale data.
export const keys = {
  apis: ['apis'] as const,
  requests: ['access-requests'] as const,
  apiKeys: ['api-keys'] as const,
  notifications: ['notifications'] as const,
  usage: ['usage'] as const,
};

const data = <T>(promise: Promise<{ data: { data: T } }>) => promise.then((r) => r.data.data);
const page = <T>(promise: Promise<{ data: Paged<T> }>) => promise.then((r) => r.data);

// ---- Catalog ------------------------------------------------------------------------------

export interface ApiFilters {
  q?: string;
  tags?: string[];
  status?: ApiStatus | '';
  page?: number;
  mine?: boolean;
  limit?: number;
}

export function useApis(filters: ApiFilters) {
  return useQuery({
    queryKey: [...keys.apis, filters],
    queryFn: () =>
      page<Api>(
        api.get('/apis', {
          params: {
            q: filters.q || undefined,
            tags: filters.tags?.length ? filters.tags.join(',') : undefined,
            status: filters.status || undefined,
            page: filters.page,
            limit: filters.limit ?? 12,
            mine: filters.mine ? 'true' : undefined,
          },
        })
      ),
    // Keep showing the previous page while the next one loads, instead of a spinner.
    placeholderData: keepPreviousData,
  });
}

/** Tags used by the APIs this user can see, most used first, for the filter bar. */
export function useApiTags() {
  return useQuery({
    queryKey: [...keys.apis, 'tags'],
    queryFn: () => data<{ tag: string; count: number }[]>(api.get('/apis/tags')),
  });
}

export function useApi(slug: string) {
  return useQuery({
    queryKey: [...keys.apis, 'detail', slug],
    queryFn: () => data<Api>(api.get(`/apis/${slug}`)),
  });
}

// ---- Access requests ----------------------------------------------------------------------

export function useAccessRequests(filters: { status?: RequestStatus; page?: number }) {
  return useQuery({
    queryKey: [...keys.requests, filters],
    queryFn: () =>
      page<AccessRequest>(
        api.get('/access-requests', { params: { status: filters.status, page: filters.page } })
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRequestAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { api: string; planName: string; useCase: string }) =>
      data<AccessRequest>(api.post('/access-requests', body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.requests }),
  });
}

export type ReviewAction = 'approve' | 'reject' | 'revoke';

export function useReviewRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: ReviewAction; note?: string }) =>
      data<AccessRequest>(
        api.post(`/access-requests/${id}/${action}`, { note: note || undefined })
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.requests });
      // Revoking access also revokes keys.
      void queryClient.invalidateQueries({ queryKey: keys.apiKeys });
    },
  });
}

// ---- API keys -----------------------------------------------------------------------------

export function useApiKeys() {
  return useQuery({
    queryKey: keys.apiKeys,
    queryFn: () => page<ApiKey>(api.get('/api-keys', { params: { limit: 100 } })),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { accessRequestId: string; name: string }) =>
      data<{ key: string; apiKey: ApiKey }>(api.post('/api-keys', body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.apiKeys }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data<ApiKey>(api.delete(`/api-keys/${id}`)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.apiKeys }),
  });
}

// ---- Notifications ------------------------------------------------------------------------

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () =>
      api
        .get<{ data: AppNotification[]; meta: PageMeta & { unread: number } }>('/notifications', {
          params: { limit: 10 },
        })
        .then((r) => r.data),
    // Check for new notifications every 30 seconds while the tab is open.
    refetchInterval: 30_000,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications }),
  });
}

// ---- Usage --------------------------------------------------------------------------------

export function rangeParams(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useMyUsage(days: number) {
  return useQuery({
    queryKey: [...keys.usage, 'me', days],
    queryFn: () => data<MyUsage>(api.get('/analytics/me', { params: rangeParams(days) })),
  });
}

export function useApiUsage(slug: string | undefined, days: number) {
  const params = rangeParams(days);
  const summary = useQuery({
    queryKey: [...keys.usage, slug, 'summary', days],
    queryFn: () => data<ApiUsageSummary>(api.get(`/analytics/apis/${slug}/summary`, { params })),
    enabled: Boolean(slug),
  });
  const series = useQuery({
    queryKey: [...keys.usage, slug, 'series', days],
    queryFn: () => data<UsageSeries>(api.get(`/analytics/apis/${slug}/timeseries`, { params })),
    enabled: Boolean(slug),
  });
  return { summary, series };
}
