import { mongo, trusted, type QueryFilter, type SortOrder } from 'mongoose';

import { env } from '../../config/env';
import { AppError } from '../../errors/app-error';
import type { Role } from '../../generated/prisma/enums';
import { pageMeta, toSkip } from '../../lib/pagination';
import { ApiModel, type ApiDocument, type ApiFields } from './api.model';
import type { CreateApiInput, ListApisQuery, UpdateApiInput } from './api.schemas';

export interface Viewer {
  id: string;
  role: Role;
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Rejects upstream URLs whose host is not on the allowlist. See UPSTREAM_ALLOWED_HOSTS. */
export function assertAllowedUpstream(url: string) {
  const { hostname } = new URL(url);

  if (!env.UPSTREAM_ALLOWED_HOSTS.includes(hostname)) {
    throw new AppError(400, 'UPSTREAM_NOT_ALLOWED', `Upstream host "${hostname}" is not allowed`);
  }
}

function canManage(viewer: Viewer, api: Pick<ApiFields, 'ownerId'>) {
  return viewer.role === 'ADMIN' || api.ownerId === viewer.id;
}

/** Which APIs a user may see: published ones, plus their own drafts (or everything for admins). */
function visibleTo(viewer: Viewer): QueryFilter<ApiFields> {
  if (viewer.role === 'ADMIN') return {};
  if (viewer.role === 'PUBLISHER')
    return { $or: [{ status: 'published' }, { ownerId: viewer.id }] };
  return { status: 'published' };
}

/** The API as returned to clients. The upstream URL is internal, so only managers see it. */
export function toApiResponse(api: ApiDocument, viewer: Viewer) {
  return {
    id: api.id as string,
    name: api.name,
    slug: api.slug,
    description: api.description,
    version: api.version,
    status: api.status,
    ownerId: api.ownerId,
    tags: api.tags,
    plans: api.plans.map((p) => ({
      name: p.name,
      rateLimitPerMinute: p.rateLimitPerMinute,
      monthlyQuota: p.monthlyQuota ?? null,
    })),
    upstreamUrl: canManage(viewer, api) ? api.upstreamUrl : undefined,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  };
}

function isDuplicateKey(err: unknown) {
  return err instanceof mongo.MongoServerError && err.code === 11000;
}

export async function listApis(query: ListApisQuery, viewer: Viewer) {
  const conditions: QueryFilter<ApiFields>[] = [visibleTo(viewer)];

  if (query.status) conditions.push({ status: query.status });
  if (query.tag) conditions.push({ tags: query.tag });
  if (query.mine) conditions.push({ ownerId: viewer.id });
  // sanitizeFilter blocks every $ operator, including ones we write ourselves. This one is safe
  // to allow: the search term has been validated as a plain string.
  // Mongoose checks the value under $text, so that is what gets marked as trusted.
  if (query.q) conditions.push({ $text: trusted({ $search: query.q }) });

  const filter = { $and: conditions };
  // With a search term, rank by relevance; otherwise show the newest first.
  const sort: Record<string, SortOrder | { $meta: 'textScore' }> = query.q
    ? { score: { $meta: 'textScore' } }
    : { createdAt: -1 };

  const [apis, total] = await Promise.all([
    ApiModel.find(filter).sort(sort).skip(toSkip(query)).limit(query.limit),
    ApiModel.countDocuments(filter),
  ]);

  return { apis, meta: pageMeta(query, total) };
}

/** Finds an API by id or slug. Hidden APIs return 404, not 403, so their existence stays private. */
export async function getVisibleApi(idOrSlug: string, viewer: Viewer) {
  const byIdOrSlug =
    mongo.ObjectId.isValid(idOrSlug) && idOrSlug.length === 24
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

  const api = await ApiModel.findOne({ $and: [byIdOrSlug, visibleTo(viewer)] });

  if (!api) {
    throw new AppError(404, 'API_NOT_FOUND', 'API not found');
  }

  return api;
}

export async function createApi(input: CreateApiInput, viewer: Viewer) {
  assertAllowedUpstream(input.upstreamUrl);

  const slug = input.slug ?? slugify(input.name);
  if (slug.length < 3) {
    throw new AppError(400, 'INVALID_SLUG', 'Choose a slug of at least 3 characters');
  }

  try {
    return await ApiModel.create({ ...input, slug, ownerId: viewer.id });
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new AppError(409, 'SLUG_TAKEN', `The slug "${slug}" is already in use`);
    }
    throw err;
  }
}

export async function updateApi(id: string, input: UpdateApiInput, viewer: Viewer) {
  const api = await getVisibleApi(id, viewer);

  if (!canManage(viewer, api)) {
    throw new AppError(403, 'FORBIDDEN', 'Only the owner or an admin can change this API');
  }

  if (input.upstreamUrl) {
    assertAllowedUpstream(input.upstreamUrl);
  }

  api.set(input);
  return api.save();
}
