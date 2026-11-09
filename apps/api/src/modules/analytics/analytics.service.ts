import type { Types } from 'mongoose';

import { prisma } from '../../db/prisma';
import { apiSummaries } from '../access-requests/access-request.service';
import { UsageLogModel } from '../usage/usage-log.model';
import type { Range } from './analytics.schemas';

const isClientError = { $and: [{ $gte: ['$statusCode', 400] }, { $lt: ['$statusCode', 500] }] };
const isServerError = { $gte: ['$statusCode', 500] };

/** Shared $group fields: counts, error counts and latency. */
const stats = {
  requests: { $sum: 1 },
  clientErrors: { $sum: { $cond: [isClientError, 1, 0] } },
  serverErrors: { $sum: { $cond: [isServerError, 1, 0] } },
  avgLatencyMs: { $avg: '$latencyMs' },
};

interface Stats {
  requests: number;
  clientErrors: number;
  serverErrors: number;
  avgLatencyMs: number | null;
}

function round(n: number | null | undefined) {
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * Totals, error rate, latency (average and 95th percentile), responses by status code and the
 * top consumers, for one API. One aggregation with $facet computes all of them in a single
 * pass over the matching logs.
 */
export async function apiSummary(apiId: Types.ObjectId, range: Range) {
  const [result] = await UsageLogModel.aggregate<{
    totals: (Stats & { p95: number[] })[];
    byStatus: { _id: number; count: number }[];
    topConsumers: { _id: string; requests: number }[];
  }>([
    // The match comes first and uses the { apiId, at } index, so only this API's logs in this
    // range are read.
    { $match: { apiId, at: { $gte: range.from, $lt: range.to } } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              ...stats,
              // $percentile needs MongoDB 7.0 or newer.
              p95: { $percentile: { input: '$latencyMs', p: [0.95], method: 'approximate' } },
            },
          },
        ],
        byStatus: [{ $group: { _id: '$statusCode', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        topConsumers: [
          { $group: { _id: '$developerId', requests: { $sum: 1 } } },
          { $sort: { requests: -1 } },
          { $limit: 5 },
        ],
      },
    },
  ]);

  const totals = result?.totals[0];
  const requests = totals?.requests ?? 0;

  // Developers live in Postgres, logs in MongoDB: the "join" happens here, with one query.
  const consumerIds = result?.topConsumers.map((c) => c._id) ?? [];
  const users = consumerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: consumerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return {
    range: { from: range.from, to: range.to },
    requests,
    clientErrors: totals?.clientErrors ?? 0,
    serverErrors: totals?.serverErrors ?? 0,
    errorRate: requests ? round(((totals?.serverErrors ?? 0) / requests) * 100) : 0,
    avgLatencyMs: round(totals?.avgLatencyMs),
    p95LatencyMs: round(totals?.p95?.[0]),
    byStatus: (result?.byStatus ?? []).map((s) => ({ statusCode: s._id, count: s.count })),
    topConsumers: (result?.topConsumers ?? []).map((c) => ({
      developerId: c._id,
      name: userById.get(c._id)?.name ?? null,
      email: userById.get(c._id)?.email ?? null,
      requests: c.requests,
    })),
  };
}

/** Every bucket start between from and to, so periods with no traffic show as zero. */
function bucketStarts(range: Range) {
  const step = range.interval === 'hour' ? 3_600_000 : 86_400_000;
  const first = Math.floor(range.from.getTime() / step) * step;
  const starts: number[] = [];
  for (let t = first; t < range.to.getTime(); t += step) starts.push(t);
  return starts;
}

async function timeseries(match: Record<string, unknown>, range: Range) {
  const rows = await UsageLogModel.aggregate<Stats & { _id: Date }>([
    { $match: { ...match, at: { $gte: range.from, $lt: range.to } } },
    {
      // $dateTrunc rounds each timestamp down to the start of its hour or day.
      $group: {
        _id: { $dateTrunc: { date: '$at', unit: range.interval, timezone: 'UTC' } },
        ...stats,
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byStart = new Map(rows.map((r) => [r._id.getTime(), r]));

  return {
    interval: range.interval,
    points: bucketStarts(range).map((start) => {
      const row = byStart.get(start);
      return {
        at: new Date(start),
        requests: row?.requests ?? 0,
        clientErrors: row?.clientErrors ?? 0,
        serverErrors: row?.serverErrors ?? 0,
        avgLatencyMs: round(row?.avgLatencyMs),
      };
    }),
  };
}

export function apiTimeseries(apiId: Types.ObjectId, range: Range) {
  return timeseries({ apiId }, range);
}

/** A developer's own usage, per API, plus their combined time series. */
export async function developerUsage(developerId: string, range: Range) {
  const perApi = await UsageLogModel.aggregate<Stats & { _id: Types.ObjectId }>([
    { $match: { developerId, at: { $gte: range.from, $lt: range.to } } },
    { $group: { _id: '$apiId', ...stats } },
    { $sort: { requests: -1 } },
  ]);
  const apis = await apiSummaries(perApi.map((p) => p._id));

  return {
    range: { from: range.from, to: range.to },
    apis: perApi.map((p) => ({
      api: apis.get(String(p._id)) ?? { id: String(p._id), name: 'Deleted API', slug: '' },
      requests: p.requests,
      clientErrors: p.clientErrors,
      serverErrors: p.serverErrors,
      avgLatencyMs: round(p.avgLatencyMs),
    })),
    timeseries: await timeseries({ developerId }, range),
  };
}
