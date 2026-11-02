import app from './app.ts';
import { prisma } from './db.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

const server = app.listen(env.PORT, () => {
  // Data in fields, fixed message — searchable in log tools.
  logger.info(
    {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      appEnv: env.APP_ENV,
      url: `http://localhost:${env.PORT}`,
    },
    `${env.APP_NAME} started`,
  );
});

// Graceful shutdown. `docker stop` / a redeploy sends SIGTERM (Ctrl+C sends
// SIGINT), then kills us for real after a timeout (Docker: 10 s).
// Instead of dying mid-request:
//   1. stop accepting new connections
//   2. let requests in flight finish
//   3. close the DB pool, then exit
function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down');

  // Safety net: a stuck request must not block the exit forever.
  // unref() = this timer alone doesn't keep the process alive.
  setTimeout(() => {
    logger.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, 8_000).unref();

  // close() stops new connections and calls back once open ones are done
  // (idle keep-alive connections are closed right away).
  server.close(async (err) => {
    await prisma.$disconnect();
    if (err) logger.error({ err }, 'error while closing server');
    process.exit(err ? 1 : 0);
  });
}

// once: a second Ctrl+C doesn't start a second shutdown.
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
