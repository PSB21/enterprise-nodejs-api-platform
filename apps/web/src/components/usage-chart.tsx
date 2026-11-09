'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { UsageSeries } from '@/lib/types';

const hourLabel = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });
const dayLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** Requests per hour or day, split into successful calls, client errors and server errors. */
export function UsageChart({ series }: { series: UsageSeries }) {
  const format = series.interval === 'hour' ? hourLabel : dayLabel;
  const rows = series.points.map((p) => ({
    label: format.format(new Date(p.at)),
    Successful: p.requests - p.clientErrors - p.serverErrors,
    '4xx': p.clientErrors,
    '5xx': p.serverErrors,
  }));

  return (
    <div className="h-72" role="img" aria-label={`Requests per ${series.interval}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Successful" stackId="r" fill="#6366f1" />
          <Bar dataKey="4xx" stackId="r" fill="#f59e0b" />
          <Bar dataKey="5xx" stackId="r" fill="#e11d48" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
