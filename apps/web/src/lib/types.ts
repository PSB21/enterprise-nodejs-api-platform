// Shapes of the API's responses. They mirror the OpenAPI document served at /api/docs.

export type Role = 'ADMIN' | 'PUBLISHER' | 'DEVELOPER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  user: User;
}

export interface Plan {
  name: string;
  rateLimitPerMinute: number;
  monthlyQuota: number | null;
}

export type ApiStatus = 'draft' | 'published' | 'deprecated';

export interface Api {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  status: ApiStatus;
  ownerId: string;
  tags: string[];
  plans: Plan[];
  upstreamUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface ApiRef {
  id: string;
  name?: string;
  slug?: string;
}

export interface AccessRequest {
  id: string;
  api: ApiRef;
  developerId: string;
  developer: { id: string; name: string; email: string } | null;
  planName: string;
  useCase: string;
  status: RequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  history: { status: RequestStatus; by: string; note: string | null; at: string }[];
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  api: ApiRef;
  accessRequestId: string;
  planName: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export interface UsagePoint {
  at: string;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  avgLatencyMs: number | null;
}

export interface UsageSeries {
  interval: 'hour' | 'day';
  points: UsagePoint[];
}

export interface ApiUsageSummary {
  requests: number;
  clientErrors: number;
  serverErrors: number;
  errorRate: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  byStatus: { statusCode: number; count: number }[];
  topConsumers: {
    developerId: string;
    name: string | null;
    email: string | null;
    requests: number;
  }[];
}

export interface MyUsage {
  apis: {
    api: { id: string; name: string; slug: string };
    requests: number;
    clientErrors: number;
    serverErrors: number;
    avgLatencyMs: number | null;
  }[];
  timeseries: UsageSeries;
}
