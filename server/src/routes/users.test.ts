import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { createUser } from '../test/factories.ts';

const URL = '/api/v1/users';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('GET /api/v1/users/:userId', () => {
  it('returns the user, without the password hash', async () => {
    const user = await createUser({ email: 'a@b.com', name: 'A' });

    const res = await request(app).get(`${URL}/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, email: 'a@b.com' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['not a UUID', 'nope'],
    ['valid UUID, no row', MISSING_ID],
  ])('returns 404 for unknown id (%s)', async (_label, id) => {
    const res = await request(app).get(`${URL}/${id}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/users/:userId', () => {
  it('deletes the user and, by cascade, their workouts', async () => {
    // Created straight through Prisma: this test is about the DB cascade,
    // not about the workouts API.
    const user = await createUser();
    await prisma.workout.createMany({
      data: [
        { name: 'Run', durationMin: 30, userId: user.id },
        { name: 'Yoga', durationMin: 20, userId: user.id },
      ],
    });

    const res = await request(app).delete(`${URL}/${user.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.workout.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each([
    ['not a UUID', 'nope'],
    ['valid UUID, no row', MISSING_ID],
  ])('returns 404 for unknown id (%s)', async (_label, id) => {
    const res = await request(app).delete(`${URL}/${id}`);

    expect(res.status).toBe(404);
  });
});
