import mongoose, { mongo, trusted, type QueryFilter } from 'mongoose';

import { AppError } from '../../errors/app-error';
import { pageMeta, toSkip } from '../../lib/pagination';
import { ApiModel } from '../apis/api.model';
import { getVisibleApi, type Viewer } from '../apis/api.service';
import { NotificationModel } from '../notifications/notification.model';
import {
  AccessRequestModel,
  type AccessRequestDocument,
  type AccessRequestFields,
  type AccessRequestStatus,
} from './access-request.model';
import type { CreateAccessRequestInput, ListAccessRequestsQuery } from './access-request.schemas';

/** Developers see their own requests, publishers the requests for their APIs, admins all. */
export function requestsVisibleTo(viewer: Viewer): QueryFilter<AccessRequestFields> {
  if (viewer.role === 'ADMIN') return {};
  if (viewer.role === 'PUBLISHER') return { apiOwnerId: viewer.id };
  return { developerId: viewer.id };
}

export function toAccessRequestResponse(
  request: AccessRequestDocument,
  api?: { id: string; name: string; slug: string }
) {
  return {
    id: request.id as string,
    api: api ?? { id: String(request.apiId) },
    developerId: request.developerId,
    planName: request.planName,
    useCase: request.useCase,
    status: request.status,
    reviewNote: request.reviewNote ?? null,
    reviewedBy: request.reviewedBy ?? null,
    reviewedAt: request.reviewedAt ?? null,
    history: request.history.map((h) => ({
      status: h.status,
      by: h.by,
      note: h.note ?? null,
      at: h.at,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

/** Looks up the name and slug of each API in one query, for list responses. */
export async function apiSummaries(apiIds: unknown[]) {
  const ids = [...new Set(apiIds.map(String))];
  // sanitizeFilter would neutralise our own $in, so it is marked as trusted. The ids come from
  // our database, not from the request.
  const apis = await ApiModel.find({ _id: trusted({ $in: ids }) }).select('name slug');
  return new Map(
    apis.map((a) => [String(a._id), { id: String(a._id), name: a.name, slug: a.slug }])
  );
}

export async function createAccessRequest(input: CreateAccessRequestInput, viewer: Viewer) {
  const api = await getVisibleApi(input.api, viewer);

  if (api.status !== 'published') {
    throw new AppError(400, 'API_NOT_PUBLISHED', 'Access can only be requested to published APIs');
  }

  const plan = api.plans.find((p) => p.name.toLowerCase() === input.planName.toLowerCase());
  if (!plan) {
    throw new AppError(400, 'PLAN_NOT_FOUND', `This API has no plan called "${input.planName}"`);
  }

  try {
    const request = await AccessRequestModel.create({
      apiId: api._id,
      apiOwnerId: api.ownerId,
      developerId: viewer.id,
      planName: plan.name,
      useCase: input.useCase,
      history: [{ status: 'pending', by: viewer.id, at: new Date() }],
    });
    return { request, api: { id: api.id as string, name: api.name, slug: api.slug } };
  } catch (err) {
    // The partial unique index, not a prior check, is what guarantees one active request.
    if (err instanceof mongo.MongoServerError && err.code === 11000) {
      throw new AppError(
        409,
        'ACCESS_ALREADY_REQUESTED',
        'You already have a pending or approved request for this API'
      );
    }
    throw err;
  }
}

export async function listAccessRequests(query: ListAccessRequestsQuery, viewer: Viewer) {
  const filter: QueryFilter<AccessRequestFields> = {
    ...requestsVisibleTo(viewer),
    ...(query.status ? { status: query.status } : {}),
    ...(query.apiId ? { apiId: query.apiId } : {}),
  };

  const [requests, total] = await Promise.all([
    AccessRequestModel.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit),
    AccessRequestModel.countDocuments(filter),
  ]);
  const apis = await apiSummaries(requests.map((r) => r.apiId));

  return {
    data: requests.map((r) => toAccessRequestResponse(r, apis.get(String(r.apiId)))),
    meta: pageMeta(query, total),
  };
}

export async function getAccessRequest(id: string, viewer: Viewer) {
  const request = await AccessRequestModel.findOne({ _id: id, ...requestsVisibleTo(viewer) });

  if (!request) {
    throw new AppError(404, 'ACCESS_REQUEST_NOT_FOUND', 'Access request not found');
  }

  return request;
}

const MESSAGES: Record<string, (api: string) => string> = {
  approved: (api) => `Your access request for ${api} was approved. You can now create API keys.`,
  rejected: (api) => `Your access request for ${api} was rejected.`,
  revoked: (api) => `Your access to ${api} was revoked, and its API keys no longer work.`,
};

/**
 * Moves a request from one status to another and notifies the developer.
 *
 * Both writes happen in one transaction: either the decision and the notification are both
 * saved, or neither is. Without it, a crash between the two could approve a request silently.
 * Transactions need a replica set, which Atlas always is.
 */
export async function transition(
  id: string,
  from: AccessRequestStatus,
  to: AccessRequestStatus,
  viewer: Viewer,
  note: string | undefined,
  extra?: (request: AccessRequestDocument, session: mongoose.ClientSession) => Promise<void>
) {
  if (viewer.role === 'DEVELOPER') {
    throw new AppError(403, 'FORBIDDEN', 'Only the API owner or an admin can do this');
  }

  return mongoose.connection.transaction(async (session) => {
    const existing = await AccessRequestModel.findOne({
      _id: id,
      ...requestsVisibleTo(viewer),
    }).session(session);

    if (!existing) {
      throw new AppError(404, 'ACCESS_REQUEST_NOT_FOUND', 'Access request not found');
    }

    // The status condition in the filter makes this a compare-and-set: if two reviewers act
    // at once, only the first update matches and the second gets null.
    const now = new Date();
    const updated = await AccessRequestModel.findOneAndUpdate(
      { _id: id, status: from },
      {
        $set: {
          status: to,
          active: to === 'pending' || to === 'approved',
          reviewNote: note,
          reviewedBy: viewer.id,
          reviewedAt: now,
        },
        $push: { history: { status: to, by: viewer.id, note, at: now } },
      },
      { new: true, session }
    );

    if (!updated) {
      throw new AppError(
        409,
        'INVALID_STATUS',
        `Only a ${from} request can be ${to}; this one is ${existing.status}`
      );
    }

    await extra?.(updated, session);

    const api = await ApiModel.findById(updated.apiId).select('name').session(session);
    const message = MESSAGES[to]?.(api?.name ?? 'an API') ?? `Your access was ${to}.`;

    await NotificationModel.create(
      [
        {
          userId: updated.developerId,
          type: `access-request.${to}`,
          message,
          data: { accessRequestId: updated.id as string, apiId: String(updated.apiId), note },
        },
      ],
      { session }
    );

    return updated;
  });
}
