import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { authHeader, createUser } from '../test/factories.ts';

const ME = '/api/v1/users/me';

describe('GET /api/v1/users/me', () => {
  it('returns the logged-in user, without the password hash', async () => {
    const user = await createUser({ email: 'a@b.com' });

    const res = await request(app)
      .get(ME)
      .set('Authorization', await authHeader(user.id));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, email: 'a@b.com' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(ME);

    expect(res.status).toBe(401);
  });

  it('there is no /users/:userId anymore', async () => {
    const user = await createUser();

    const res = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set('Authorization', await authHeader(user.id));

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/users/me', () => {
  it('deletes the account and, by cascade, its workouts', async () => {
    const user = await createUser();
    await prisma.workout.createMany({
      data: [
        { name: 'Run', durationMin: 30, userId: user.id },
        { name: 'Yoga', durationMin: 20, userId: user.id },
      ],
    });

    const res = await request(app)
      .delete(ME)
      .set('Authorization', await authHeader(user.id));

    expect(res.status).toBe(204);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.workout.count({ where: { userId: user.id } })).toBe(0);
  });

  it("deletes only the caller's account", async () => {
    const me = await createUser();
    const other = await createUser();

    await request(app)
      .delete(ME)
      .set('Authorization', await authHeader(me.id));

    expect(await prisma.user.count({ where: { id: other.id } })).toBe(1);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).delete(ME);

    expect(res.status).toBe(401);
  });
});

// JWTs are stateless: after account deletion the old token still passes
// requireAuth until it expires (15 min). The user behind it is gone, so
// the API must answer 401 ("log out"), not crash or pretend.
describe('a still-valid token for a deleted user', () => {
  it('gets 401 from /users/me (GET and DELETE)', async () => {
    const user = await createUser();
    const auth = await authHeader(user.id);
    await request(app).delete(ME).set('Authorization', auth);

    const get = await request(app).get(ME).set('Authorization', auth);
    const del = await request(app).delete(ME).set('Authorization', auth);

    expect(get.status).toBe(401);
    expect(del.status).toBe(401);
  });

  it('gets 401 when creating a workout', async () => {
    const user = await createUser();
    const auth = await authHeader(user.id);
    await request(app).delete(ME).set('Authorization', auth);

    const res = await request(app)
      .post('/api/v1/workouts')
      .set('Authorization', auth)
      .send({ name: 'Run', durationMin: 30 });

    expect(res.status).toBe(401);
  });
});
