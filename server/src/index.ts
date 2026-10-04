import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { purgeExpiredSessions } from './modules/auth/sessions.js';

const config = loadConfig();
const pool = createPool(config);
const app = await buildApp(config, pool);

if (config.MIGRATE_ON_START) {
  const result = await migrate(pool);
  app.log.info({ applied: result.applied }, 'migrations checked');
}

// Housekeeping: expired sessions are rejected on read anyway; this keeps the table small.
const purge = setInterval(
  () => {
    purgeExpiredSessions(pool)
      .then((n) => n > 0 && app.log.info({ purged: n }, 'expired sessions purged'))
      .catch((err: unknown) => app.log.warn({ err }, 'session purge failed'));
  },
  60 * 60 * 1000,
);
purge.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  clearInterval(purge);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.HOST, port: config.PORT });
