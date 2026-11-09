'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { UsageChart } from '@/components/usage-chart';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatNumber } from '@/lib/format';
import { useApis, useApiUsage, useMyUsage } from '@/lib/queries';
import { useAppSelector } from '@/store';

const RANGES = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

function RangePicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
      {RANGES.map((r) => (
        <button
          key={r.days}
          onClick={() => onChange(r.days)}
          aria-pressed={days === r.days}
          className={`rounded px-3 py-1 ${days === r.days ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

const ms = (value: number | null) => (value === null ? '—' : `${Math.round(value)} ms`);

/** For developers: their own calls, across every API they use. */
function DeveloperUsage({ days }: { days: number }) {
  const { data, isLoading, error } = useMyUsage(days);

  if (isLoading) return <Spinner label="Loading usage" />;
  if (error || !data) return <Alert>{errorMessage(error)}</Alert>;
  if (data.apis.length === 0) {
    return <EmptyState title="No calls yet">Call the gateway with one of your keys.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <UsageChart series={data.timeseries} />
      </Card>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">API</th>
              <th className="px-4 py-3 text-right">Requests</th>
              <th className="px-4 py-3 text-right">4xx</th>
              <th className="px-4 py-3 text-right">5xx</th>
              <th className="px-4 py-3 text-right">Avg latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.apis.map((row) => (
              <tr key={row.api.id}>
                <td className="px-4 py-3 font-medium">{row.api.name}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.requests)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.clientErrors)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.serverErrors)}</td>
                <td className="px-4 py-3 text-right">{ms(row.avgLatencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** For publishers and admins: one API's traffic, errors, latency and top consumers. */
function PublisherUsage({ days }: { days: number }) {
  const role = useAppSelector((s) => s.auth.user?.role);
  const params = useSearchParams();
  const apis = useApis({ mine: role !== 'ADMIN', limit: 100 });
  const [chosen, setChosen] = useState(params.get('api') ?? '');
  const slug = chosen || apis.data?.data[0]?.slug;
  const { summary, series } = useApiUsage(slug, days);

  if (apis.isLoading) return <Spinner label="Loading your APIs" />;
  if (apis.data?.data.length === 0) return <EmptyState title="You have no APIs yet" />;

  const s = summary.data;

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-3 text-sm">
        <span className="font-medium text-slate-700">API</span>
        <select
          value={slug}
          onChange={(e) => setChosen(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5"
        >
          {apis.data?.data.map((a) => (
            <option key={a.id} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {(summary.error || series.error) && (
        <Alert>{errorMessage(summary.error ?? series.error)}</Alert>
      )}
      {summary.isLoading && <Spinner label="Loading usage" />}

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Requests" value={formatNumber(s.requests)} />
          <Stat label="Server error rate" value={`${s.errorRate}%`} />
          <Stat label="Average latency" value={ms(s.avgLatencyMs)} />
          <Stat label="p95 latency" value={ms(s.p95LatencyMs)} />
        </div>
      )}

      {series.data && (
        <Card>
          <UsageChart series={series.data} />
        </Card>
      )}

      {s && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold">Top consumers</h2>
            {s.topConsumers.length === 0 ? (
              <p className="text-sm text-slate-500">No traffic in this period.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {s.topConsumers.map((c) => (
                  <li key={c.developerId} className="flex justify-between py-2">
                    <span>
                      {c.name ?? 'Deleted user'}
                      <span className="block text-xs text-slate-500">{c.email}</span>
                    </span>
                    <span className="font-medium">{formatNumber(c.requests)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Responses by status</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {s.byStatus.map((b) => (
                <li key={b.statusCode} className="flex justify-between py-2">
                  <span className="font-mono">{b.statusCode}</span>
                  <span>{formatNumber(b.count)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function UsagePage() {
  const role = useAppSelector((s) => s.auth.user?.role);
  const [days, setDays] = useState(7);

  return (
    <>
      <PageHeader
        title="Usage"
        description={
          role === 'DEVELOPER'
            ? 'Your calls through the gateway.'
            : 'Traffic, errors and latency for your APIs.'
        }
        action={<RangePicker days={days} onChange={setDays} />}
      />
      {/* useSearchParams needs a Suspense boundary so the page can still be prerendered. */}
      <Suspense fallback={<Spinner />}>
        {role === 'DEVELOPER' ? <DeveloperUsage days={days} /> : <PublisherUsage days={days} />}
      </Suspense>
    </>
  );
}
