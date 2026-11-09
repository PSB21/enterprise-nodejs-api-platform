import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

import { createApiClient } from './api-client';

/** Builds a fake network that answers each request from a function. */
function fakeAdapter(
  respond: (config: InternalAxiosRequestConfig) => { status: number; data: unknown }
): AxiosAdapter {
  return async (config) => {
    const { status, data } = respond(config);
    const response = { status, data, statusText: '', headers: {}, config };
    if (status >= 400) {
      throw new AxiosError('Request failed', String(status), config, null, response);
    }
    return response;
  };
}

const expired = { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } };

describe('createApiClient', () => {
  it('sends the access token', async () => {
    let sent: string | undefined;
    const client = createApiClient({
      getAccessToken: () => 'token-1',
      refresh: jest.fn(),
      onSessionExpired: jest.fn(),
      adapter: fakeAdapter((config) => {
        sent = config.headers.get('Authorization') as string;
        return { status: 200, data: {} };
      }),
    });

    await client.get('/apis');

    expect(sent).toBe('Bearer token-1');
  });

  it('refreshes once for several requests that expire together, then retries each', async () => {
    let token = 'old';
    const refresh = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      token = 'new';
      return 'new';
    });
    const client = createApiClient({
      getAccessToken: () => token,
      refresh,
      onSessionExpired: jest.fn(),
      adapter: fakeAdapter((config) =>
        config.headers.get('Authorization') === 'Bearer new'
          ? { status: 200, data: { url: config.url } }
          : expired
      ),
    });

    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.data.url)).toEqual(['/a', '/b', '/c']);
  });

  it('ends the session when the refresh fails', async () => {
    const onSessionExpired = jest.fn();
    const client = createApiClient({
      getAccessToken: () => 'old',
      refresh: async () => null,
      onSessionExpired,
      adapter: fakeAdapter(() => expired),
    });

    await expect(client.get('/apis')).rejects.toThrow();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('retries only once, so a token that keeps failing cannot loop', async () => {
    const refresh = jest.fn(async () => 'still-bad');
    const client = createApiClient({
      getAccessToken: () => 'old',
      refresh,
      onSessionExpired: jest.fn(),
      adapter: fakeAdapter(() => expired),
    });

    await expect(client.get('/apis')).rejects.toThrow();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for other errors such as 403', async () => {
    const refresh = jest.fn();
    const client = createApiClient({
      getAccessToken: () => 'token',
      refresh,
      onSessionExpired: jest.fn(),
      adapter: fakeAdapter(() => ({ status: 403, data: { error: { code: 'FORBIDDEN' } } })),
    });

    await expect(client.get('/users')).rejects.toThrow();
    expect(refresh).not.toHaveBeenCalled();
  });
});
