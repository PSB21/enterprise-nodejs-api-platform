import express, { Router, type Request, type Response } from 'express';

import { env } from '../../config/env';
import { AppError } from '../../errors/app-error';
import { usageRecorder } from '../usage/usage-recorder';
import {
  buildUpstreamUrl,
  enforcePlan,
  findActiveKey,
  findServedApi,
  touchKey,
} from './gateway.service';

export const gatewayRouter = Router();

// Request headers passed on to the upstream. An allowlist, so secrets such as the caller's
// API key, cookies and Authorization header are never forwarded.
const FORWARDED_REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'user-agent'];
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'last-modified',
  'location',
];

// Keep the body as raw bytes: the gateway forwards it untouched, whatever its format.
gatewayRouter.use(express.raw({ type: () => true, limit: '1mb' }));

/** Logs every request that got as far as a valid key and API, whatever the outcome. */
function logWhenFinished(req: Request, res: Response, started: number) {
  res.on('finish', () => {
    const usage = res.locals.usage as
      { apiId: unknown; keyId: unknown; developerId: string } | undefined;
    if (!usage) return;

    usageRecorder.record({
      apiId: usage.apiId as never,
      keyId: usage.keyId as never,
      developerId: usage.developerId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs: Math.round(performance.now() - started),
      at: new Date(),
    });
  });
}

gatewayRouter.all('/:slug{/*path}', async (req, res) => {
  const started = performance.now();
  logWhenFinished(req, res, started);

  const rawKey = req.get('x-api-key');
  if (!rawKey) {
    throw new AppError(401, 'API_KEY_MISSING', 'Send your API key in the x-api-key header');
  }

  const [key, api] = await Promise.all([findActiveKey(rawKey), findServedApi(req.params.slug)]);

  if (key.apiId !== api.id) {
    throw new AppError(403, 'KEY_NOT_VALID_FOR_API', 'This key belongs to a different API');
  }

  // From here on, the request is attributed to this key and logged, even if it fails.
  res.locals.usage = { apiId: api.id, keyId: key.id, developerId: key.developerId };
  touchKey(key.id);

  // Throws 429 when the plan's per-minute limit or monthly quota is used up.
  const limit = await enforcePlan(key, api).catch((err: unknown) => {
    const retryAfter = (err as AppError).details as { retryAfterSeconds?: number } | undefined;
    if (retryAfter?.retryAfterSeconds) res.set('Retry-After', String(retryAfter.retryAfterSeconds));
    throw err;
  });
  if (limit) {
    res.set({
      'X-RateLimit-Limit': String(limit.limit),
      'X-RateLimit-Remaining': String(limit.remaining),
      'X-RateLimit-Reset': String(limit.resetSeconds),
    });
  }

  const segments = (req.params as { path?: string[] }).path ?? [];
  const target = buildUpstreamUrl(api.upstreamUrl, segments, req.originalUrl);

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-forwarded-for', req.ip ?? '');
  // Lets the upstream know which consumer this is, without exposing the key.
  headers.set('x-ams-consumer', key.developerId);

  const hasBody =
    !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? (req.body as Buffer) : undefined,
      // Do not follow redirects: a redirect could point at a host outside the allowlist.
      redirect: 'manual',
      signal: AbortSignal.timeout(env.GATEWAY_TIMEOUT_MS),
    });
  } catch (err) {
    // Checked by name, not instanceof: the error is a DOMException, which can come from another
    // JavaScript realm (as under Jest), where instanceof Error is false.
    if ((err as { name?: unknown } | null)?.name === 'TimeoutError') {
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'The upstream API did not respond in time');
    }
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'The upstream API could not be reached');
  }

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.set(name, value);
  }
  if (api.status === 'deprecated') {
    res.set('Deprecation', 'true');
  }

  res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
});
