import axios, {
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

export interface ApiClientOptions {
  getAccessToken: () => string | null;
  /** Gets a new access token using the refresh cookie, or null if the session is over. */
  refresh: () => Promise<string | null>;
  /** Called when the session cannot be refreshed, so the app can log the user out. */
  onSessionExpired: () => void;
  /** Lets tests replace the network. */
  adapter?: AxiosAdapter;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * An Axios instance for the API that attaches the access token and, when it has expired,
 * refreshes it once and retries the request.
 */
export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: '/api/v1', adapter: options.adapter });

  // Several requests can fail with an expired token at the same time. They must share one
  // refresh: the server allows each refresh token to be used once, and treats a second use as
  // theft, which would log the user out.
  let refreshing: Promise<string | null> | null = null;
  const refreshOnce = () => {
    refreshing ??= options.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  client.interceptors.request.use((config) => {
    const token = options.getAccessToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  client.interceptors.response.use(
    undefined,
    async (error: AxiosError<{ error?: { code?: string } }>) => {
      const config = error.config as RetriableConfig | undefined;
      const expired =
        error.response?.status === 401 && error.response.data?.error?.code === 'TOKEN_EXPIRED';

      // Only retry once, so a token that keeps failing cannot cause an endless loop.
      if (!expired || !config || config._retried) {
        throw error;
      }

      const token = await refreshOnce();
      if (!token) {
        options.onSessionExpired();
        throw error;
      }

      config._retried = true;
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set('Authorization', `Bearer ${token}`);
      return client(config);
    }
  );

  return client;
}
