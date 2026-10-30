import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';

// Tests run against the fitbuddy_test database, emptied before each test
// (src/test/setup.ts). Each test creates the data it needs.

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

// Two kinds of "unknown id":
// - not a UUID -> rejected by isValidId, no query runs
// - a valid UUID with no row -> query runs and finds nothing / throws P2025
const UNKNOWN_IDS = [
  ['not a UUID', 'does-not-exist'],
  ['valid UUID, no row', MISSING_ID],
];

// Fresh owner for every test. setup.ts deletes all users first,
// so this beforeEach runs after the cleanup.
let userId: string;
let url: string; // /api/v1/users/<userId>/workouts

beforeEach(async () => {
  const user = await prisma.user.create({
    data: { email: 'owner@test.com', name: 'Owner' },
  });
  userId = user.id;
  url = `/api/v1/users/${userId}/workouts`;
});

async function createWorkout(body = { name: 'Yoga', durationMin: 20 }) {
  const res = await request(app).post(url).send(body);
  return res.body;
}

describe('POST /users/:userId/workouts', () => {
  it('creates a workout for the user and returns 201', async () => {
    const res = await request(app)
      .post(url)
      .send({ name: '  Run  ', durationMin: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Run', durationMin: 30, userId });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));
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
    const res = await request(app).post(url).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown user (%s)',
    async (_label, badUserId) => {
      const res = await request(app)
        .post(`/api/v1/users/${badUserId}/workouts`)
        .send({ name: 'Yoga', durationMin: 20 });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'User not found' });
    },
  );
});

describe('GET /users/:userId/workouts', () => {
  it("lists only this user's workouts, newest first", async () => {
    const first = await createWorkout({ name: 'Run', durationMin: 30 });
    const second = await createWorkout({ name: 'Swim', durationMin: 45 });
    // Another user's workout must not appear.
    const other = await prisma.user.create({
      data: { email: 'other@test.com', name: 'Other' },
    });
    await prisma.workout.create({
      data: { name: 'Not mine', durationMin: 10, userId: other.id },
    });

    const res = await request(app).get(url);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([second, first]);
  });

  it('returns 404 for a non-UUID user id', async () => {
    const res = await request(app).get('/api/v1/users/nope/workouts');

    expect(res.status).toBe(404);
  });
});

describe('GET /users/:userId/workouts/:id', () => {
  it('returns the workout', async () => {
    const created = await createWorkout();

    const res = await request(app).get(`${url}/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await request(app).get(`${url}/${id}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workout not found' });
    },
  );
});

describe('PATCH /users/:userId/workouts/:id', () => {
  it('updates only the fields sent', async () => {
    const created = await createWorkout({ name: 'Swim', durationMin: 40 });

    const res = await request(app)
      .patch(`${url}/${created.id}`)
      .send({ durationMin: 45 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, durationMin: 45 });
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await request(app)
        .patch(`${url}/${id}`)
        .send({ durationMin: 45 });

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

    const res = await request(app).patch(`${url}/${created.id}`).send(body);

    expect(res.status).toBe(400);
  });

  it('does not half-update when one field is invalid', async () => {
    const created = await createWorkout({ name: 'Bike', durationMin: 60 });

    await request(app)
      .patch(`${url}/${created.id}`)
      .send({ name: 'New name', durationMin: -1 });

    const res = await request(app).get(`${url}/${created.id}`);
    expect(res.body).toEqual(created); // nothing changed
  });
});

describe('DELETE /users/:userId/workouts/:id', () => {
  it('deletes the workout and returns 204 with no body', async () => {
    const created = await createWorkout();

    const res = await request(app).delete(`${url}/${created.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    // It's really gone.
    const after = await request(app).get(`${url}/${created.id}`);
    expect(after.status).toBe(404);
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await request(app).delete(`${url}/${id}`);

      expect(res.status).toBe(404);
    },
  );
});

// IDOR: user B must not reach user A's workout by putting A's workout id
// in B's URL. Every route must answer 404 — the same as "doesn't exist",
// so B can't even learn that the workout exists.
describe("another user's workout (IDOR)", () => {
  let aWorkout: { id: string };
  let bUrl: string;

  beforeEach(async () => {
    aWorkout = await createWorkout({ name: "A's run", durationMin: 30 });
    const userB = await prisma.user.create({
      data: { email: 'b@test.com', name: 'B' },
    });
    bUrl = `/api/v1/users/${userB.id}/workouts/${aWorkout.id}`;
  });

  it('GET returns 404', async () => {
    const res = await request(app).get(bUrl);
    expect(res.status).toBe(404);
  });

  it('PATCH returns 404 and changes nothing', async () => {
    const res = await request(app).patch(bUrl).send({ name: 'Hacked' });

    expect(res.status).toBe(404);
    const stored = await prisma.workout.findUnique({
      where: { id: aWorkout.id },
    });
    expect(stored?.name).toBe("A's run");
  });

  it('DELETE returns 404 and deletes nothing', async () => {
    const res = await request(app).delete(bUrl);

    expect(res.status).toBe(404);
    expect(await prisma.workout.count({ where: { id: aWorkout.id } })).toBe(1);
  });
});
