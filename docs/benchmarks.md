# Gateway benchmark

What caching key and API lookups does to gateway performance, measured on 9 November 2026.

## Results

| Gateway lookups              | Requests per second | Average | p50   | p90    | p99      |
| ---------------------------- | ------------------- | ------- | ----- | ------ | -------- |
| Cached (in memory)           | 758                 | 13 ms   | 10 ms | 22 ms  | 41 ms    |
| Not cached (MongoDB lookups) | 27                  | 343 ms  | 81 ms | 932 ms | 1,822 ms |

No errors and no non-2xx responses in either run.

## Setup

- **Tool:** [autocannon](https://github.com/mcollina/autocannon), 10 connections for 10 seconds, against `GET /gateway/orders`.
- **Machine:** a Windows laptop (AMD Ryzen 5 4600H, 8 GB RAM) on home broadband in India.
- **Databases:** MongoDB Atlas (free M0 cluster) and Neon Postgres (Singapore), both reached over the internet.
- **Upstream:** the built-in sample API on the same server, so upstream time is small.
- **Server:** the compiled API (`node dist/server.js`), with `RATE_LIMIT_ENABLED=false` so the plan's limit does not cut the run short, and `CACHE_ENABLED` set to `true` or `false`.
- **Cache:** the in-memory cache, because no Redis server was configured. With Redis, each lookup adds a network round trip to Redis, so cached latency would be higher than shown here.

## What the numbers mean

Without the cache, every gateway call waits for two MongoDB lookups (the key and the API) over the internet before forwarding the request. The cache removes both round trips for repeat calls, which is why throughput rises about 28 times and median latency falls from 81 ms to 10 ms.

The size of the gain comes mostly from the network distance to the databases. On a server in the same region as the databases, uncached lookups would be much faster and the difference much smaller. Quote these numbers with this context, not as general figures.

## Reproduce

```bash
# Terminal 1: start the API (run twice: once with CACHE_ENABLED=true, once with false)
npm run build --workspace=@ams/api
CACHE_ENABLED=true RATE_LIMIT_ENABLED=false npm start

# Terminal 2: create an API key in the dashboard, then
BENCH_KEY=ams_... npm run bench:gateway --workspace=@ams/api
```
