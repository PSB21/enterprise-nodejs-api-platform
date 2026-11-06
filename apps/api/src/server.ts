import { createApp } from './app';
import { env } from './config/env';

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`);
  // Stop accepting new connections and let requests in progress finish.
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
