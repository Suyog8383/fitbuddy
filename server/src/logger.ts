import { pino } from 'pino';
import { env } from './env.ts';

// Minimum level per environment. Anything below it is dropped.
const defaultLevel =
  env.NODE_ENV === 'test'
    ? 'silent' // keep test output clean
    : env.NODE_ENV === 'production'
      ? 'info'
      : 'debug';

// LOG_LEVEL in env wins, e.g. LOG_LEVEL=debug to dig into a prod issue.
const level = env.LOG_LEVEL ?? defaultLevel;

// One logger for the whole app. Import this instead of using console.*.
export const logger = pino({
  level,

  // Safety net: these fields are replaced with "[Redacted]" before
  // anything is written. Logs are copied everywhere — treat them as public.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
    ],
    censor: '[Redacted]',
  },

  // Dev only: pretty, colored lines for humans.
  // Prod: plain JSON to stdout, the host collects it (pino-pretty is slow).
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
