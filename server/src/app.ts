import express from 'express';
import workoutsRouter from './routes/workouts.ts';

const app = express();

// Middleware: runs on every request, in the order added.
// express.json() reads a JSON request body and puts it on req.body.
app.use(express.json());

// Health check: lets you (and later, deploy platforms) see the server is alive.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount the router: every path inside it is prefixed with /api/v1/workouts.
// /v1 = API version, so a breaking change later can go to /v2.
app.use('/api/v1/workouts', workoutsRouter);

export default app;
