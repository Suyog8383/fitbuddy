import express from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.ts';
import authRouter from './routes/auth.ts';
import usersRouter from './routes/users.ts';
import workoutsRouter from './routes/workouts.ts';
import { notFound } from './middleware/notFound.ts';
import { errorHandler } from './middleware/errorHandler.ts';

const app = express();

// Middleware: runs on every request, in the order added.

// Request logging — first, so every request is logged, even ones that
// fail later (e.g. bad JSON). Logs one line when the response finishes.
// Also adds req.log: a logger that tags every line with this request's id.
app.use(
  pinoHttp({
    logger,

    // Request ID: a unique id per request, on every log line it produces.
    // Sent back as a header so a bug report can point to the exact logs.
    genReqId: (_req, res) => {
      const id = crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },

    // Level by outcome: 5xx = our bug, 4xx = client mistake.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    // Serializers pick what goes in the log line. Default logs every
    // header — noisy and risky. Log only what we need to debug.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },

    // Deploy platforms hit /health every few seconds — skip the noise.
    autoLogging: { ignore: (req) => req.url === '/health' },
  }),
);

// express.json() reads a JSON request body and puts it on req.body.
app.use(express.json());

// Health check: lets you (and later, deploy platforms) see the server is alive.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount the router: every path inside it is prefixed with /api/v1/workouts.
// /v1 = API version, so a breaking change later can go to /v2.
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
// Nested: workouts belong to a user (1 -> N).
app.use('/api/v1/users/:userId/workouts', workoutsRouter);

// Order matters: these go last.
// 1. No route matched -> 404 JSON.
app.use(notFound);
// 2. Any thrown error -> JSON 400/500.
app.use(errorHandler);

export default app;
