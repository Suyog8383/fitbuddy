import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { z } from 'zod';
import { prisma } from '../db.ts';
import {
  AdminUserResponse,
  ErrorResponse,
  LoginResponse,
  StatsResponse,
  TokenPairResponse,
  UserResponse,
  WorkoutResponse,
} from '../schemas/responses.ts';
import { authHeader, createUser, TEST_PASSWORD } from '../test/factories.ts';

// Contract tests: real responses must match the DOCUMENTED schemas.
// The schemas are strictObjects, so an extra field (a leak) fails too.
// If these fail, either the code or the docs are wrong — fix one.

const login = async (email: string) =>
  request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: TEST_PASSWORD });

describe('contract: auth', () => {
  it('register -> User', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'c@mail.com',
      name: 'C',
      password: 'long enough password',
    });

    expect(res.status).toBe(201);
    UserResponse.parse(res.body);
  });

  it('login -> LoginResponse', async () => {
    await createUser({ email: 'c@mail.com' });

    const res = await login('c@mail.com');

    expect(res.status).toBe(200);
    LoginResponse.parse(res.body);
  });

  it('refresh -> TokenPair', async () => {
    await createUser({ email: 'c@mail.com' });
    const { refreshToken } = (await login('c@mail.com')).body;

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    TokenPairResponse.parse(res.body);
  });

  it('errors -> Error (plain and validation)', async () => {
    const plain = await login('nobody@mail.com');
    const validation = await request(app)
      .post('/api/v1/auth/register')
      .send({});

    ErrorResponse.parse(plain.body);
    ErrorResponse.parse(validation.body);
    expect(validation.body.details.length).toBeGreaterThan(0);
  });
});

describe('contract: users', () => {
  it('GET /users/me with a full profile -> User', async () => {
    const user = await createUser();
    const auth = await authHeader(user.id);
    await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', auth)
      .send({
        heightCm: 178,
        weightKg: 72.5,
        birthDate: '1995-04-12',
        goal: 'STAY_ACTIVE',
      });

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', auth);

    UserResponse.parse(res.body);
  });
});

describe('contract: change password', () => {
  it('POST /users/me/password -> TokenPair', async () => {
    const user = await createUser();

    const res = await request(app)
      .post('/api/v1/users/me/password')
      .set('Authorization', await authHeader(user.id))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'a new password' });

    expect(res.status).toBe(200);
    TokenPairResponse.parse(res.body);
  });
});

describe('contract: workouts', () => {
  it('create, get, list, update -> Workout', async () => {
    const user = await createUser();
    const auth = await authHeader(user.id);
    const api = (method: 'get' | 'post' | 'patch', path: string) =>
      request(app)
        [method](`/api/v1/workouts${path}`)
        .set('Authorization', auth);

    const created = await api('post', '').send({
      name: 'Run',
      durationMin: 30,
    });
    const one = await api('get', `/${created.body.id}`);
    const list = await api('get', '');
    const updated = await api('patch', `/${created.body.id}`).send({
      durationMin: 45,
    });

    WorkoutResponse.parse(created.body);
    WorkoutResponse.parse(one.body);
    z.array(WorkoutResponse).parse(list.body);
    WorkoutResponse.parse(updated.body);
    expect(list.body).toHaveLength(1);
  });
});

describe('contract: admin', () => {
  it('users list, one user, update, stats', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const auth = await authHeader(admin.id);
    const target = await createUser();
    await prisma.profile.create({ data: { userId: target.id, weightKg: 70 } });
    const get = (path: string) =>
      request(app).get(`/api/v1/admin${path}`).set('Authorization', auth);

    const list = await get('/users');
    const one = await get(`/users/${target.id}`);
    const updated = await request(app)
      .patch(`/api/v1/admin/users/${target.id}`)
      .set('Authorization', auth)
      .send({ disabled: true });
    const stats = await get('/stats');

    // strictObject: a profile/weight leaking into admin data would fail here.
    z.array(AdminUserResponse).parse(list.body);
    AdminUserResponse.parse(one.body);
    AdminUserResponse.parse(updated.body);
    StatsResponse.parse(stats.body);
    expect(updated.body.disabledAt).toEqual(expect.any(String));
  });
});
