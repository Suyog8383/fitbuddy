import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { authHeader, createUser } from '../test/factories.ts';

// Tests run against the fitbuddy_test database, emptied before each test
// (src/test/setup.ts). Each test creates the data it needs.

const URL = '/api/v1/workouts';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

// Two kinds of "unknown id":
// - not a UUID -> rejected by isValidId, no query runs
// - a valid UUID with no row -> query runs and finds nothing / throws P2025
const UNKNOWN_IDS = [
  ['not a UUID', 'does-not-exist'],
  ['valid UUID, no row', MISSING_ID],
];

// Fresh logged-in owner for every test. setup.ts deletes all users first,
// so this beforeEach runs after the cleanup.
let userId: string;
let auth: string; // "Bearer <token>"

beforeEach(async () => {
  const user = await createUser();
  userId = user.id;
  auth = await authHeader(userId);
});

// Requests as the logged-in owner.
const api = {
  get: (path: string) => request(app).get(path).set('Authorization', auth),
  post: (path: string) => request(app).post(path).set('Authorization', auth),
  patch: (path: string) => request(app).patch(path).set('Authorization', auth),
  delete: (path: string) =>
    request(app).delete(path).set('Authorization', auth),
};

async function createWorkout(body = { name: 'Yoga', durationMin: 20 }) {
  const res = await api.post(URL).send(body);
  return res.body;
}

describe('without a token', () => {
  it.each([
    ['GET list', () => request(app).get(URL)],
    ['GET one', () => request(app).get(`${URL}/${MISSING_ID}`)],
    ['POST', () => request(app).post(URL).send({ name: 'X', durationMin: 1 })],
    ['PATCH', () => request(app).patch(`${URL}/${MISSING_ID}`).send({})],
    ['DELETE', () => request(app).delete(`${URL}/${MISSING_ID}`)],
  ])('%s returns 401', async (_label, send) => {
    const res = await send();

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });
});

describe('POST /workouts', () => {
  it('creates a workout for the logged-in user and returns 201', async () => {
    const res = await api.post(URL).send({ name: '  Run  ', durationMin: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Run', durationMin: 30, userId });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));
  });

  it('ignores a userId in the body — the owner comes from the token', async () => {
    const other = await createUser();

    const res = await api
      .post(URL)
      .send({ name: 'Run', durationMin: 30, userId: other.id });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(userId);
  });

  // it.each runs the same test once per row — one test per bad input.
  it.each([
    ['no body', undefined],
    ['missing name', { durationMin: 20 }],
    ['name not a string', { name: 123, durationMin: 20 }],
    ['empty name', { name: '   ', durationMin: 20 }],
    ['missing durationMin', { name: 'Yoga' }],
    ['durationMin as string', { name: 'Yoga', durationMin: 'abc' }],
    ['durationMin zero', { name: 'Yoga', durationMin: 0 }],
    ['durationMin negative', { name: 'Yoga', durationMin: -5 }],
    ['durationMin not an integer', { name: 'Yoga', durationMin: 20.5 }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await api.post(URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /workouts', () => {
  it('lists only my workouts, newest first', async () => {
    const first = await createWorkout({ name: 'Run', durationMin: 30 });
    const second = await createWorkout({ name: 'Swim', durationMin: 45 });
    // Another user's workout must not appear.
    const other = await createUser();
    await prisma.workout.create({
      data: { name: 'Not mine', durationMin: 10, userId: other.id },
    });

    const res = await api.get(URL);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([second, first]);
  });
});

describe('GET /workouts/:id', () => {
  it('returns the workout', async () => {
    const created = await createWorkout();

    const res = await api.get(`${URL}/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await api.get(`${URL}/${id}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workout not found' });
    },
  );
});

describe('PATCH /workouts/:id', () => {
  it('updates only the fields sent', async () => {
    const created = await createWorkout({ name: 'Swim', durationMin: 40 });

    const res = await api
      .patch(`${URL}/${created.id}`)
      .send({ durationMin: 45 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, durationMin: 45 });
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await api.patch(`${URL}/${id}`).send({ durationMin: 45 });

      expect(res.status).toBe(404);
    },
  );

  it.each([
    ['name not a string', { name: [] }],
    ['empty name', { name: '' }],
    ['durationMin zero', { durationMin: 0 }],
    ['durationMin negative', { durationMin: -5 }],
    ['durationMin not an integer', { durationMin: 20.5 }],
  ])('returns 400 for %s', async (_label, body) => {
    const created = await createWorkout();

    const res = await api.patch(`${URL}/${created.id}`).send(body);

    expect(res.status).toBe(400);
  });

  it('does not half-update when one field is invalid', async () => {
    const created = await createWorkout({ name: 'Bike', durationMin: 60 });

    await api
      .patch(`${URL}/${created.id}`)
      .send({ name: 'New name', durationMin: -1 });

    const res = await api.get(`${URL}/${created.id}`);
    expect(res.body).toEqual(created); // nothing changed
  });
});

describe('DELETE /workouts/:id', () => {
  it('deletes the workout and returns 204 with no body', async () => {
    const created = await createWorkout();

    const res = await api.delete(`${URL}/${created.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    // It's really gone.
    const after = await api.get(`${URL}/${created.id}`);
    expect(after.status).toBe(404);
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await api.delete(`${URL}/${id}`);

      expect(res.status).toBe(404);
    },
  );
});

// IDOR: user B, logged in with B's own valid token, asks for A's workout
// by id. Every route must answer 404 — the same as "doesn't exist",
// so B can't even learn that the workout exists.
describe("another user's workout (IDOR)", () => {
  let aWorkoutUrl: string;
  let bAuth: string;

  beforeEach(async () => {
    const aWorkout = await createWorkout({ name: "A's run", durationMin: 30 });
    aWorkoutUrl = `${URL}/${aWorkout.id}`;
    const userB = await createUser();
    bAuth = await authHeader(userB.id);
  });

  it('GET returns 404', async () => {
    const res = await request(app).get(aWorkoutUrl).set('Authorization', bAuth);

    expect(res.status).toBe(404);
  });

  it('PATCH returns 404 and changes nothing', async () => {
    const res = await request(app)
      .patch(aWorkoutUrl)
      .set('Authorization', bAuth)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(404);
    const stored = await api.get(aWorkoutUrl);
    expect(stored.body.name).toBe("A's run");
  });

  it('DELETE returns 404 and deletes nothing', async () => {
    const res = await request(app)
      .delete(aWorkoutUrl)
      .set('Authorization', bAuth);

    expect(res.status).toBe(404);
    const stored = await api.get(aWorkoutUrl);
    expect(stored.status).toBe(200);
  });
});
