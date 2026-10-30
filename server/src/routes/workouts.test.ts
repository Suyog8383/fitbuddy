import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';

const URL = '/api/v1/workouts';

// Tests run against the fitbuddy_test database, emptied before each test
// (src/test/setup.ts). Each test creates the workouts it needs.

// Two kinds of "unknown id":
// - not a UUID -> rejected by isValidId, no query runs
// - a valid UUID with no row -> query runs; update/delete throw P2025
const UNKNOWN_IDS = [
  ['not a UUID', 'does-not-exist'],
  ['valid UUID, no row', '00000000-0000-4000-8000-000000000000'],
];
async function createWorkout(body = { name: 'Yoga', durationMin: 20 }) {
  const res = await request(app).post(URL).send(body);
  return res.body;
}

describe('POST /api/v1/workouts', () => {
  it('creates a workout and returns 201', async () => {
    const res = await request(app)
      .post(URL)
      .send({ name: '  Run  ', durationMin: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Run', durationMin: 30 }); // name trimmed
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
    const res = await request(app).post(URL).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /api/v1/workouts', () => {
  it('lists workouts, including a newly created one', async () => {
    const created = await createWorkout();

    const res = await request(app).get(URL);

    expect(res.status).toBe(200);
    expect(res.body).toContainEqual(created);
  });
});

describe('GET /api/v1/workouts/:id', () => {
  it('returns the workout', async () => {
    const created = await createWorkout();

    const res = await request(app).get(`${URL}/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await request(app).get(`${URL}/${id}`);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Workout not found' });
    },
  );
});

describe('PATCH /api/v1/workouts/:id', () => {
  it('updates only the fields sent', async () => {
    const created = await createWorkout({ name: 'Swim', durationMin: 40 });

    const res = await request(app)
      .patch(`${URL}/${created.id}`)
      .send({ durationMin: 45 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, durationMin: 45 });
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await request(app)
        .patch(`${URL}/${id}`)
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

    const res = await request(app).patch(`${URL}/${created.id}`).send(body);

    expect(res.status).toBe(400);
  });

  it('does not half-update when one field is invalid', async () => {
    const created = await createWorkout({ name: 'Bike', durationMin: 60 });

    await request(app)
      .patch(`${URL}/${created.id}`)
      .send({ name: 'New name', durationMin: -1 });

    const res = await request(app).get(`${URL}/${created.id}`);
    expect(res.body).toEqual(created); // nothing changed
  });
});

describe('DELETE /api/v1/workouts/:id', () => {
  it('deletes the workout and returns 204 with no body', async () => {
    const created = await createWorkout();

    const res = await request(app).delete(`${URL}/${created.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    // It's really gone.
    const after = await request(app).get(`${URL}/${created.id}`);
    expect(after.status).toBe(404);
  });

  it.each(UNKNOWN_IDS)(
    'returns 404 for unknown id (%s)',
    async (_label, id) => {
      const res = await request(app).delete(`${URL}/${id}`);

      expect(res.status).toBe(404);
    },
  );
});
