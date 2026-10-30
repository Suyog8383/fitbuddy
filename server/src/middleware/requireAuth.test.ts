import { describe, expect, it } from 'vitest';
import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { logger } from '../logger.ts';
import { signAccessToken } from '../lib/tokens.ts';
import { errorHandler } from './errorHandler.ts';
import { authUser, requireAuth } from './requireAuth.ts';

const USER_ID = '19947659-5395-44c3-a736-24ad91836126';

// Tiny throwaway app: one protected route that echoes who it thinks you are,
// one unprotected route that wrongly calls authUser().
const testApp = express();
testApp.use(pinoHttp({ logger })); // requireAuth logs via req.log
testApp.get('/protected', requireAuth, (req, res) => {
  res.json({ userId: authUser(req).id });
});
testApp.get('/forgot-require-auth', (req, res) => {
  res.json({ userId: authUser(req).id });
});
testApp.use(errorHandler);

describe('requireAuth', () => {
  it('lets a valid token through and sets req.user from it', async () => {
    const token = await signAccessToken(USER_ID);

    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: USER_ID });
  });

  it('accepts the scheme in any letter case', async () => {
    const token = await signAccessToken(USER_ID);

    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it.each([
    ['no Authorization header', undefined],
    ['empty header', ''],
    ['scheme only', 'Bearer'],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['token without scheme', 'eyJhbGciOiJIUzI1NiJ9.e30.x'],
    ['invalid token', 'Bearer not.a.jwt'],
  ])('returns 401 for %s', async (_label, header) => {
    const req = request(testApp).get('/protected');
    if (header !== undefined) req.set('Authorization', header);

    const res = await req;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  // Token checks themselves (expired, tampered, alg none, ...) are covered
  // in lib/tokens.test.ts — here we only check the middleware turns
  // "verify threw" into a 401.
});

describe('authUser', () => {
  it('throws (-> 500) on a route that forgot requireAuth', async () => {
    const res = await request(testApp).get('/forgot-require-auth');

    expect(res.status).toBe(500);
  });
});
