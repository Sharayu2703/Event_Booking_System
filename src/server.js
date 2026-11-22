import { validateEnv, env } from './config/env.js';
import { connectDB } from './config/db.js';
import { redisConnection } from './config/queue.js';
import { dispatchPendingOutbox } from './services/outbox.js';
import app from './app.js';

let server;
async function start() {
  validateEnv();
  await connectDB();
  await redisConnection.ping();
  server = app.listen(env.port, () => console.log(`API listening on port ${env.port}`));
  // Lightweight outbox poller. In production, consider a dedicated dispatcher process.
  const poller = setInterval(() => dispatchPendingOutbox().catch(err => console.error('Outbox poll error', err.message)), 1500);
  poller.unref();
}
async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  if (server) await new Promise(resolve => server.close(resolve));
  await redisConnection.quit().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
