import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { authHeader, createUser, TEST_PASSWORD } from '../test/factories.ts';

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

describe('profile: GET + PATCH /api/v1/users/me', () => {
  // "YYYY-MM-DD" for the day `years` ago, like the schema computes it.
  const dayYearsAgo = (years: number) => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0, 10);
  };

  let auth: string;
  let userId: string;
  beforeEach(async () => {
    userId = (await createUser({ name: 'Suyog' })).id;
    auth = await authHeader(userId);
  });

  const patch = (body: unknown) =>
    request(app)
      .patch(ME)
      .set('Authorization', auth)
      .send(body as object);
  const getMe = () => request(app).get(ME).set('Authorization', auth);

  it('returns exactly the allowlisted fields, profile null at first', async () => {
    const res = await getMe();

    expect(Object.keys(res.body).sort()).toEqual(
      [
        'createdAt',
        'email',
        'emailVerifiedAt',
        'id',
        'name',
        'profile',
        'role',
      ].sort(),
    );
    expect(res.body.profile).toBeNull();
  });

  it('creates the profile on the first PATCH', async () => {
    const res = await patch({
      heightCm: 178,
      weightKg: 72.46,
      birthDate: '1995-04-12',
      goal: 'BUILD_MUSCLE',
    });

    expect(res.status).toBe(200);
    expect(res.body.profile).toEqual({
      heightCm: 178,
      weightKg: 72.5, // rounded to 0.1
      birthDate: '1995-04-12', // date only, no time/zone
      goal: 'BUILD_MUSCLE',
      units: 'METRIC', // default
    });
    // And GET returns the same.
    expect((await getMe()).body.profile).toEqual(res.body.profile);
  });

  it('stores the birth date as that exact calendar day', async () => {
    await patch({ birthDate: '1995-04-12' });

    const row = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    expect(row.birthDate?.toISOString()).toBe('1995-04-12T00:00:00.000Z');
  });

  it('changes only the fields sent', async () => {
    await patch({ heightCm: 178, weightKg: 72 });

    const res = await patch({ weightKg: 70 });

    expect(res.body.profile).toMatchObject({ heightCm: 178, weightKg: 70 });
  });

  it('null clears a field (absent = keep, null = clear)', async () => {
    await patch({ heightCm: 178, goal: 'STAY_ACTIVE' });

    const res = await patch({ goal: null });

    expect(res.body.profile).toMatchObject({ heightCm: 178, goal: null });
  });

  it('updates the name without creating a profile', async () => {
    const res = await patch({ name: '  New Name ' });

    expect(res.body.name).toBe('New Name');
    expect(res.body.profile).toBeNull();
  });

  it('updates name and profile together', async () => {
    const res = await patch({ name: 'Both', units: 'IMPERIAL' });

    expect(res.body.name).toBe('Both');
    expect(res.body.profile.units).toBe('IMPERIAL');
  });

  it('accepts someone who turns 13 today', async () => {
    const res = await patch({ birthDate: dayYearsAgo(13) });

    expect(res.status).toBe(200);
  });

  it.each([
    ['name null (required)', { name: null }],
    ['name empty', { name: '  ' }],
    ['units null (has a default)', { units: null }],
    ['heightCm too small', { heightCm: 49 }],
    ['heightCm too big', { heightCm: 301 }],
    ['heightCm not an integer', { heightCm: 170.5 }],
    ['heightCm as string', { heightCm: '170' }],
    ['weightKg too small', { weightKg: 19 }],
    ['weightKg too big (typo 725)', { weightKg: 725 }],
    ['goal unknown', { goal: 'FLY' }],
    ['birthDate not YYYY-MM-DD', { birthDate: '12/04/1995' }],
    ['birthDate with a time', { birthDate: '1995-04-12T00:00:00Z' }],
    ['birthDate impossible day', { birthDate: '1995-02-30' }],
    ['birthDate before 1900', { birthDate: '1899-12-31' }],
    ['birthDate under 13', { birthDate: dayYearsAgo(12) }],
    ['birthDate in the future', { birthDate: dayYearsAgo(-1) }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe(Object.keys(body)[0]);
  });

  it('changes nothing when one field is invalid', async () => {
    await patch({ heightCm: 178 });

    await patch({ heightCm: 180, weightKg: 725 });

    expect((await getMe()).body.profile.heightCm).toBe(178);
  });

  // Mass assignment: email/verification can't be changed through here.
  it('ignores fields it does not know', async () => {
    const before = (await getMe()).body;

    const res = await patch({
      email: 'hacker@mail.com',
      emailVerifiedAt: '2020-01-01T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000000',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(before);
  });

  // The whole point of "no self-service role changes".
  it('cannot make yourself an admin', async () => {
    const res = await patch({ role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('USER');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.role).toBe('USER');
  });

  it('deleting the account deletes the profile (cascade)', async () => {
    await patch({ heightCm: 178 });

    await request(app).delete(ME).set('Authorization', auth);

    expect(await prisma.profile.count({ where: { userId } })).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).patch(ME).send({ name: 'X' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/users/me/password', () => {
  const EMAIL = 'pw@mail.com';
  const NEW_PASSWORD = 'a brand new password';

  // Real login = a real refresh token (one "device").
  async function login(password = TEST_PASSWORD) {
    return request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password });
  }
  const refresh = (refreshToken: string) =>
    request(app).post('/api/v1/auth/refresh').send({ refreshToken });

  let auth: string;
  beforeEach(async () => {
    const user = await createUser({ email: EMAIL });
    auth = await authHeader(user.id);
  });

  const change = (body: object) =>
    request(app).post(`${ME}/password`).set('Authorization', auth).send(body);

  it('changes the password: old one fails, new one works', async () => {
    const res = await change({
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect((await login()).status).toBe(401);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('logs out other devices, keeps this one with a new token pair', async () => {
    const phone = (await login()).body;
    const tablet = (await login()).body;

    const res = await change({
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect((await refresh(phone.refreshToken)).status).toBe(401);
    expect((await refresh(tablet.refreshToken)).status).toBe(401);
    // The pair from the response works.
    expect((await refresh(res.body.refreshToken)).status).toBe(200);
    const me = await request(app)
      .get(ME)
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  // 401 would make the app think the session expired and log the user out.
  it('wrong current password: 400 (not 401) and nothing changes', async () => {
    const phone = (await login()).body;

    const res = await change({
      currentPassword: 'not my password',
      newPassword: NEW_PASSWORD,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Current password is incorrect' });
    expect((await login()).status).toBe(200);
    expect((await refresh(phone.refreshToken)).status).toBe(200);
  });

  it.each([
    [
      'newPassword too short',
      { currentPassword: TEST_PASSWORD, newPassword: 'short' },
      'newPassword',
    ],
    ['newPassword missing', { currentPassword: TEST_PASSWORD }, 'newPassword'],
    [
      'currentPassword missing',
      { newPassword: NEW_PASSWORD },
      'currentPassword',
    ],
  ])('returns 400 when %s', async (_label, body, path) => {
    const res = await change(body);

    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe(path);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post(`${ME}/password`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });
});
