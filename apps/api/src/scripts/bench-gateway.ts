/**
 * Measures gateway latency and throughput with autocannon.
 *
 *   BENCH_KEY=ams_... npm run bench:gateway --workspace=@ams/api
 *
 * Run it once with the server started with CACHE_ENABLED=true and once with false to compare.
 * Start the server with RATE_LIMIT_ENABLED=false, or the plan's limit will cut the run short.
 * Results depend on the machine and network, so always quote them with that context.
 */
import autocannon from 'autocannon';

const url = process.env.BENCH_URL ?? 'http://localhost:5000/gateway/orders';
const key = process.env.BENCH_KEY;
const duration = Number(process.env.BENCH_DURATION ?? 10);
const connections = Number(process.env.BENCH_CONNECTIONS ?? 10);

if (!key) {
  console.error('Set BENCH_KEY to a working API key for the API in BENCH_URL.');
  process.exit(1);
}

async function main() {
  const result = await autocannon({ url, duration, connections, headers: { 'x-api-key': key! } });

  const summary = {
    url,
    durationSeconds: duration,
    connections,
    requests: result.requests.total,
    requestsPerSecond: Math.round(result.requests.average),
    latencyMs: {
      average: Math.round(result.latency.average),
      p50: result.latency.p50,
      p90: result.latency.p90,
      p99: result.latency.p99,
    },
    non2xx: result.non2xx,
    errors: result.errors,
  };

  console.log(JSON.stringify(summary, null, 2));
}

void main();
