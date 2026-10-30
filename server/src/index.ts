import app from './app.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

app.listen(env.PORT, () => {
  // Data in fields, fixed message — searchable in log tools.
  logger.info(
    {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      url: `http://localhost:${env.PORT}`,
    },
    `${env.APP_NAME} started`,
  );
});
