import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { z } from 'zod';
import { ErrorCode } from '../lib/http.ts';
import * as authSchemas from '../schemas/auth.ts';
import * as responseSchemas from '../schemas/responses.ts';
import * as userSchemas from '../schemas/users.ts';
import * as workoutSchemas from '../schemas/workouts.ts';
import { openApiDocument } from './index.ts';

// Every route the app has. Add a route -> add it here AND document it,
// or this test fails. (Express can't easily list its own routes, so the
// list is written by hand — one place to update.)
const ALL_ROUTES = [
  'GET /health',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/logout-all',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/resend-verification',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'GET /api/v1/users/me',
  'PATCH /api/v1/users/me',
  'DELETE /api/v1/users/me',
  'POST /api/v1/users/me/password',
  'GET /api/v1/workouts',
  'POST /api/v1/workouts',
  'GET /api/v1/workouts/{id}',
  'PATCH /api/v1/workouts/{id}',
  'DELETE /api/v1/workouts/{id}',
  'GET /api/v1/admin/users',
  'GET /api/v1/admin/users/{id}',
  'PATCH /api/v1/admin/users/{id}',
  'GET /api/v1/admin/stats',
];

// "POST /api/v1/x" for every operation in the document.
function documentedRoutes() {
  return Object.entries(openApiDocument.paths ?? {}).flatMap(([path, item]) =>
    Object.keys(item ?? {}).map((method) => `${method.toUpperCase()} ${path}`),
  );
}

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with a bearer JWT scheme', () => {
    expect(openApiDocument.openapi).toBe('3.1.0');
    expect(
      openApiDocument.components?.securitySchemes?.bearerAuth,
    ).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  });

  // Exactly: nothing missing, and nothing documented that doesn't exist.
  it('documents exactly the routes the app has', () => {
    expect(documentedRoutes().sort()).toEqual([...ALL_ROUTES].sort());
  });

  // Every protected route says so (only these auth routes are public).
  it('marks every non-public operation with bearer auth', () => {
    const PUBLIC = [
      'GET /health',
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      'POST /api/v1/auth/forgot-password',
      'POST /api/v1/auth/reset-password',
    ];
    for (const [path, item] of Object.entries(openApiDocument.paths ?? {})) {
      for (const [method, op] of Object.entries(item ?? {})) {
        const route = `${method.toUpperCase()} ${path}`;
        const expected = PUBLIC.includes(route) ? [] : [{ bearerAuth: [] }];
        expect({ route, security: op.security }).toEqual({
          route,
          security: expected,
        });
      }
    }
  });

  // A protected route documented as public (or the reverse) misleads
  // the app developer — check the security list per operation.
  it.each([
    ['/api/v1/auth/login', false],
    ['/api/v1/auth/register', false],
    ['/api/v1/auth/logout-all', true],
    ['/api/v1/auth/verify-email', true],
  ])('%s needs a token: %s', (path, needsToken) => {
    const security = openApiDocument.paths?.[path]?.post?.security;

    expect(security).toEqual(needsToken ? [{ bearerAuth: [] }] : []);
  });

  it('documents at least one error response for every operation', () => {
    for (const [path, item] of Object.entries(openApiDocument.paths ?? {})) {
      if (path === '/health') continue; // nothing to go wrong (yet)
      for (const op of Object.values(item ?? {})) {
        const codes = Object.keys(op.responses ?? {});
        expect(codes.some((code) => code >= '400')).toBe(true);
      }
    }
  });
});

describe('serving the docs', () => {
  it('GET /openapi.json returns the document', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('FitBuddy API');
  });

  it('GET /docs/ serves Swagger UI', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});

// Examples are documentation too — a wrong example misleads as much as a
// wrong schema. Every schema with an example must accept its own example.
describe('examples', () => {
  // Every exported Zod schema (skips non-schemas like MIN_AGE) that has
  // an example in its .meta().
  const schemas: [string, z.ZodType][] = Object.entries({
    ...authSchemas,
    ...userSchemas,
    ...workoutSchemas,
    ...responseSchemas,
  }).flatMap(([name, value]): [string, z.ZodType][] =>
    value instanceof z.ZodType &&
    z.globalRegistry.get(value)?.example !== undefined
      ? [[name, value]]
      : [],
  );

  it('there are examples to check', () => {
    expect(schemas.length).toBeGreaterThan(15);
  });

  it.each(schemas)('%s accepts its own example', (_name, schema) => {
    const result = schema.safeParse(z.globalRegistry.get(schema)?.example);

    expect(result.error?.issues).toBeUndefined();
  });

  it('every error example uses a real error code', () => {
    const json = JSON.stringify(openApiDocument);
    const codes = [...json.matchAll(/"code":"([A-Z_]+)"/g)].map((m) => m[1]);

    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) {
      expect(Object.values(ErrorCode)).toContain(code);
    }
  });
});

describe('page structure', () => {
  it('lists the tags in page order, each with a description', () => {
    const tags = openApiDocument.tags ?? [];

    expect(tags.map((t) => t.name)).toEqual([
      'Health',
      'Auth',
      'Users',
      'Workouts',
      'Admin',
    ]);
    for (const tag of tags) expect(tag.description).toBeTruthy();
  });

  it('every operation belongs to a declared tag', () => {
    const declared = (openApiDocument.tags ?? []).map((t) => t.name);
    for (const item of Object.values(openApiDocument.paths ?? {})) {
      for (const op of Object.values(item ?? {})) {
        expect(declared).toEqual(expect.arrayContaining(op.tags ?? ['none']));
      }
    }
  });
});
