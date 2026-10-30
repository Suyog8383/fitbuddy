import { describe, expect, it } from 'vitest';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import app from './app.ts';
import { z } from 'zod';
import { HttpError, parse } from './lib/http.ts';
import { errorHandler } from './middleware/errorHandler.ts';

// Supertest sends requests straight to `app` in memory — no listen(), no port.
// That's why app.ts exports the app and index.ts does the listening.

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('returns 404 JSON for an unknown path', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found: GET /nope' });
  });

  it('returns 404 for a method the route does not support', async () => {
    const res = await request(app).put('/health');

    expect(res.status).toBe(404);
  });
});

describe('errorHandler', () => {
  it('returns 400 JSON for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });

  it('returns generic 500 JSON for a thrown error, without leaking details', async () => {
    // Tiny throwaway app with a route that crashes, so the real app
    // doesn't need a test-only /boom route.
    // errorHandler uses req.log, which only exists if pino-http ran.
    // Give pino a fake "stream" that collects log lines in an array,
    // so we can check what was logged.
    const lines: string[] = [];
    const testLogger = pino(
      { level: 'error' },
      { write: (line: string) => lines.push(line) },
    );

    const testApp = express();
    testApp.use(pinoHttp({ logger: testLogger }));
    testApp.get('/boom', () => {
      throw new Error('secret internal detail');
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/boom');

    // Client: generic message only.
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('secret');

    // Logs: full error with stack, tagged with the request id.
    const logged = lines
      .map((line) => JSON.parse(line))
      .find((log) => log.msg === 'unhandled error');
    expect(logged.err.message).toBe('secret internal detail');
    expect(logged.err.stack).toEqual(expect.any(String));
    expect(logged.req.id).toBeDefined();
  });
});

// Throwaway app with one route + the real errorHandler.
// pino-http with a silent logger: errorHandler needs req.log.
function appThatRuns(handler: express.RequestHandler) {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  testApp.post('/test', handler);
  testApp.use(errorHandler);
  return testApp;
}

describe('errorHandler: thrown errors', () => {
  it('sends an HttpError as its status + message', async () => {
    const testApp = appThatRuns(() => {
      throw new HttpError(404, 'Workout not found');
    });

    const res = await request(testApp).post('/test');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Workout not found' });
  });

  it('turns a ZodError into 400 with every bad field', async () => {
    const Body = z.object({
      name: z.string().min(1),
      goal: z.object({ target: z.number() }),
    });
    const testApp = appThatRuns((req, res) => {
      res.json(parse(Body, req.body));
    });

    const res = await request(testApp)
      .post('/test')
      .send({ name: '', goal: { target: 'ten' } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Invalid request',
      details: [
        { path: 'name', message: expect.any(String) },
        { path: 'goal.target', message: expect.any(String) }, // nested
      ],
    });
  });

  it('never echoes the invalid input back', async () => {
    const Body = z.object({ password: z.string().min(100) });
    const testApp = appThatRuns((req, res) => {
      res.json(parse(Body, req.body));
    });

    const res = await request(testApp)
      .post('/test')
      .send({ password: 'my-secret-pass' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('my-secret-pass');
  });
});

describe('parse', () => {
  const Body = z.object({ name: z.string().trim() });

  it('returns cleaned data and drops unknown keys', () => {
    expect(parse(Body, { name: '  Run ', role: 'ADMIN' })).toEqual({
      name: 'Run',
    });
  });

  it('treats a missing body as {} -> lists each missing field', () => {
    try {
      parse(Body, undefined);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(z.ZodError);
      expect((err as z.ZodError).issues[0].path).toEqual(['name']);
    }
  });
});
