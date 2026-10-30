import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';

const URL = '/api/v1/users';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('POST /api/v1/users', () => {
  it('creates a user and returns 201', async () => {
    const res = await request(app)
      .post(URL)
      .send({ email: '  Suyog@Mail.com ', name: ' Suyog ' });

    expect(res.status).toBe(201);
    // email trimmed + lowercased, name trimmed
    expect(res.body).toMatchObject({ email: 'suyog@mail.com', name: 'Suyog' });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it.each([
    ['no body', undefined],
    ['missing email', { name: 'Suyog' }],
    ['invalid email', { email: 'not-an-email', name: 'Suyog' }],
    ['missing name', { email: 'a@b.com' }],
    ['empty name', { email: 'a@b.com', name: '  ' }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post(URL).send(body);

    expect(res.status).toBe(400);
  });

  it('returns 409 when the email is already used (any letter case)', async () => {
    await request(app).post(URL).send({ email: 'a@b.com', name: 'A' });

    const res = await request(app)
      .post(URL)
      .send({ email: 'A@B.com', name: 'Someone else' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email already in use' });
  });
});

describe('GET /api/v1/users/:userId', () => {
  it('returns the user', async () => {
    const created = await request(app)
      .post(URL)
      .send({ email: 'a@b.com', name: 'A' });

    const res = await request(app).get(`${URL}/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
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
    const user = await prisma.user.create({
      data: { email: 'a@b.com', name: 'A' },
    });
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
