import path from 'node:path';

import type { NextConfig } from 'next';

// Where the Express API runs. The browser never calls it directly: Next.js forwards /api/*
// to it, so the dashboard and the API share one origin. That keeps the refresh-token cookie
// first-party, and removes the need for CORS.
const API_URL = process.env.API_URL ?? 'http://localhost:5000';

const nextConfig: NextConfig = {
  // Produces a minimal self-contained server, used by the Docker image.
  output: 'standalone',
  // The repo is a monorepo, so trace dependencies from its root.
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  turbopack: { root: path.join(process.cwd(), '../..') },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
