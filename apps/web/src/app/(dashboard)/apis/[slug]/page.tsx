'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { RequestAccessWizard } from '@/components/request-access-wizard';
import { StatusBadge } from '@/components/status-badge';
import { Alert, Card, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useApi, useRequestAccess } from '@/lib/queries';
import { useAppSelector } from '@/store';

export default function ApiDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const user = useAppSelector((s) => s.auth.user);
  const { data: apiItem, isLoading, error } = useApi(slug);
  const requestAccess = useRequestAccess();

  if (isLoading) return <Spinner label="Loading API" />;
  if (error || !apiItem) return <Alert>{errorMessage(error)}</Alert>;

  const isManager = user?.role === 'ADMIN' || apiItem.ownerId === user?.id;

  return (
    <div className="space-y-6">
      <Link href="/apis" className="text-sm text-indigo-600 hover:underline">
        ← All APIs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{apiItem.name}</h1>
            <StatusBadge status={apiItem.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {apiItem.version} · gateway path{' '}
            <code className="text-slate-700">/gateway/{apiItem.slug}</code>
          </p>
        </div>
        {isManager && (
          <Link
            href={`/usage?api=${apiItem.slug}`}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            View usage →
          </Link>
        )}
      </div>

      <p className="max-w-3xl text-slate-700">{apiItem.description}</p>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Plans</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {apiItem.plans.map((plan) => (
              <li key={plan.name} className="py-2.5">
                <p className="font-medium">{plan.name}</p>
                <p className="text-slate-600">
                  {plan.rateLimitPerMinute} requests per minute
                  {plan.monthlyQuota ? ` · ${plan.monthlyQuota.toLocaleString()} per month` : ''}
                </p>
              </li>
            ))}
          </ul>
          {isManager && apiItem.upstreamUrl && (
            <p className="mt-4 break-all text-xs text-slate-500">
              Upstream (visible to you only): {apiItem.upstreamUrl}
            </p>
          )}
        </Card>

        {user?.role === 'DEVELOPER' && apiItem.status === 'published' && (
          <Card className="lg:col-span-3">
            <h2 className="mb-4 font-semibold">Request access</h2>
            {requestAccess.isSuccess ? (
              <Alert tone="success">
                Request sent. The publisher will review it, and you will get a notification.{' '}
                <Link href="/requests" className="font-medium underline">
                  See your requests
                </Link>
              </Alert>
            ) : (
              <RequestAccessWizard
                plans={apiItem.plans}
                submitting={requestAccess.isPending}
                error={requestAccess.error ? errorMessage(requestAccess.error) : undefined}
                onSubmit={(values) => requestAccess.mutate({ api: apiItem.slug, ...values })}
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
