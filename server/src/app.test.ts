import { describe, expect, it } from 'vitest';
import express from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import app from './app.ts';
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
