import { mongo, trusted, type QueryFilter } from 'mongoose';

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

/** Escapes regex special characters, so user input is matched literally and cannot build a slow pattern. */
function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listApis(query: ListApisQuery, viewer: Viewer) {
  const conditions: QueryFilter<ApiFields>[] = [visibleTo(viewer)];

  if (query.status) conditions.push({ status: query.status });
  // Our own $in, so it is marked trusted; each tag was validated as a short string.
  if (query.tags.length) conditions.push({ tags: trusted({ $in: query.tags }) });
  if (query.mine) conditions.push({ ownerId: viewer.id });

  if (!query.q) {
    const filter = { $and: conditions };
    const [apis, total] = await Promise.all([
      ApiModel.find(filter).sort({ createdAt: -1 }).skip(toSkip(query)).limit(query.limit),
      ApiModel.countDocuments(filter),
    ]);
    return { apis, meta: pageMeta(query, total) };
  }

  // Partial, case-insensitive search: "logi" finds "logistics". The term is escaped, so it is
  // matched as plain text. Trade-off: a pattern like this cannot use an index, so every API the
  // user can see is checked. Fine for a catalog of this size; a large one would use a search
  // engine such as Atlas Search.
  const pattern = escapeRegex(query.q);
  const matches = (field: string) => ({
    $regexMatch: { input: field, regex: pattern, options: 'i' },
  });
  conditions.push({
    $or: [
      { name: { $regex: pattern, $options: 'i' } },
      { tags: { $regex: pattern, $options: 'i' } },
      { description: { $regex: pattern, $options: 'i' } },
    ],
  });

  const [result] = await ApiModel.aggregate<{ data: ApiFields[]; total: { n: number }[] }>([
    { $match: { $and: conditions } },
    {
      // Rank: a match in the name counts most, then a tag, then the description.
      $addFields: {
        relevance: {
          $add: [
            { $cond: [matches('$name'), 4, 0] },
            {
              $cond: [
                { $gt: [{ $size: { $filter: { input: '$tags', cond: matches('$$this') } } }, 0] },
                2,
                0,
              ],
            },
            { $cond: [matches('$description'), 1, 0] },
          ],
        },
      },
    },
    { $sort: { relevance: -1, createdAt: -1 } },
    // One pass returns both the page and the total count.
    {
      $facet: {
        data: [{ $skip: toSkip(query) }, { $limit: query.limit }, { $unset: 'relevance' }],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  return {
    // Aggregation returns plain objects; hydrate turns them back into model documents.
    apis: (result?.data ?? []).map((doc) => ApiModel.hydrate(doc)),
    meta: pageMeta(query, result?.total[0]?.n ?? 0),
  };
}

/**
 * Every tag used by the APIs this user can see, with how many APIs carry it, most used first.
 * Powers the catalog's tag filter. Counting only visible APIs keeps drafts' tags private.
 */
export async function listTags(viewer: Viewer) {
  const rows = await ApiModel.aggregate<{ _id: string; count: number }>([
    { $match: visibleTo(viewer) },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 50 },
  ]);

  return rows.map((row) => ({ tag: row._id, count: row.count }));
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
