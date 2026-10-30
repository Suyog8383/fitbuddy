import { describe, expect, it, vi } from 'vitest';
import express from 'express';
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
    const res = await request(app).put('/api/v1/workouts');

    expect(res.status).toBe(404);
  });
});

describe('errorHandler', () => {
  it('returns 400 JSON for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/workouts')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });

  it('returns generic 500 JSON for a thrown error, without leaking details', async () => {
    // Tiny throwaway app with a route that crashes, so the real app
    // doesn't need a test-only /boom route.
    const testApp = express();
    testApp.get('/boom', () => {
      throw new Error('secret internal detail');
    });
    testApp.use(errorHandler);

    // errorHandler logs 500s with console.error. Silence it so test
    // output stays clean, and check it was called.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(testApp).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(spy).toHaveBeenCalledOnce();

    spy.mockRestore();
  });
});
