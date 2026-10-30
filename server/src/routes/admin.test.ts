import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { authHeader, createUser, TEST_PASSWORD } from '../test/factories.ts';

const USERS = '/api/v1/admin/users';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let adminId: string;
let adminAuth: string;

beforeEach(async () => {
  adminId = (await createUser({ email: 'admin@mail.com', role: 'ADMIN' })).id;
  adminAuth = await authHeader(adminId);
});

const asAdmin = (path: string) =>
  request(app).get(path).set('Authorization', adminAuth);

describe('admin guard (requireAuth + requireRole)', () => {
  it('401 without a token (not logged in)', async () => {
    const res = await request(app).get(USERS);

    expect(res.status).toBe(401);
  });

  // 403, not 401: the token is valid, the user just isn't allowed.
  it('403 for a normal USER', async () => {
    const user = await createUser();

    const res = await request(app)
      .get(USERS)
      .set('Authorization', await authHeader(user.id));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'Forbidden',
      code: 'FORBIDDEN',
    });
  });

  it('protects every admin path, even unknown ones', async () => {
    const user = await createUser();

    const res = await request(app)
      .get('/api/v1/admin/route-added-next-year')
      .set('Authorization', await authHeader(user.id));

    expect(res.status).toBe(403);
  });

  // Role read from the DB, not the JWT: no 15-minute grace period.
  it('a demoted admin loses access immediately, same token', async () => {
    expect((await asAdmin(USERS)).status).toBe(200);

    await prisma.user.update({
      where: { id: adminId },
      data: { role: 'USER' },
    });

    expect((await asAdmin(USERS)).status).toBe(403);
  });

  it('a disabled admin is refused', async () => {
    await prisma.user.update({
      where: { id: adminId },
      data: { disabledAt: new Date() },
    });

    expect((await asAdmin(USERS)).status).toBe(403);
  });
});

describe('GET /api/v1/admin/users', () => {
  it('lists users newest first, account fields only (no profile, no hash)', async () => {
    const user = await createUser({ email: 'suyog@mail.com' });
    await prisma.profile.create({ data: { userId: user.id, weightKg: 72 } });
    // Both rows can be created in the same millisecond -> createdAt ties ->
    // the id tie-breaker (random UUIDs) decides = flaky. Make it explicit.
    await prisma.user.update({
      where: { id: adminId },
      data: { createdAt: new Date('2026-01-01T00:00:00Z') },
    });

    const res = await asAdmin(USERS);

    expect(res.status).toBe(200);
    expect(res.body.map((u: { id: string }) => u.id)).toEqual([
      user.id,
      adminId,
    ]);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      [
        'createdAt',
        'disabledAt',
        'email',
        'emailVerifiedAt',
        'id',
        'name',
        'role',
      ].sort(),
    );
    expect(JSON.stringify(res.body)).not.toContain('weightKg');
  });

  it('returns at most 50 users', async () => {
    await prisma.user.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        email: `bulk${i}@mail.com`,
        name: `Bulk ${i}`,
        passwordHash: 'not-a-real-hash',
      })),
    });

    const res = await asAdmin(USERS);

    expect(res.body).toHaveLength(50);
  });

  it('searches by email part, case-insensitive', async () => {
    await createUser({ email: 'suyog@mail.com' });
    await createUser({ email: 'other@mail.com' });

    const res = await asAdmin(`${USERS}?email=SUYOG`);

    expect(res.body.map((u: { email: string }) => u.email)).toEqual([
      'suyog@mail.com',
    ]);
  });

  it('400 for a repeated email param (array, not a string)', async () => {
    const res = await asAdmin(`${USERS}?email=a&email=b`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('returns one user', async () => {
    const user = await createUser({ email: 'suyog@mail.com' });

    const res = await asAdmin(`${USERS}/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, role: 'USER' });
  });

  it.each([
    ['not a UUID', 'nope'],
    ['valid UUID, no row', MISSING_ID],
  ])('404 for unknown id (%s)', async (_label, id) => {
    const res = await asAdmin(`${USERS}/${id}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'User not found',
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('PATCH /api/v1/admin/users/:id', () => {
  const EMAIL = 'target@mail.com';

  const update = (id: string, body: object) =>
    request(app)
      .patch(`${USERS}/${id}`)
      .set('Authorization', adminAuth)
      .send(body);
  const login = () =>
    request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: TEST_PASSWORD });
  const refresh = (refreshToken: string) =>
    request(app).post('/api/v1/auth/refresh').send({ refreshToken });

  let targetId: string;
  beforeEach(async () => {
    targetId = (await createUser({ email: EMAIL })).id;
  });

  it('promotes a user, who can then use admin routes', async () => {
    const res = await update(targetId, { role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    const asTarget = await request(app)
      .get(USERS)
      .set('Authorization', await authHeader(targetId));
    expect(asTarget.status).toBe(200);
  });

  it('demotes an admin', async () => {
    await update(targetId, { role: 'ADMIN' });

    const res = await update(targetId, { role: 'USER' });

    expect(res.body.role).toBe('USER');
  });

  it('disabling logs the user out everywhere and blocks login', async () => {
    const session = (await login()).body;

    const res = await update(targetId, { disabled: true });

    expect(res.status).toBe(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
    // Tokens really revoked in the DB (not only refused at refresh time).
    const active = await prisma.refreshToken.count({
      where: { userId: targetId, revokedAt: null },
    });
    expect(active).toBe(0);
    expect((await refresh(session.refreshToken)).status).toBe(401);
    const blocked = await login();
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({
      error: 'Account disabled',
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('a wrong password on a disabled account still says 401 (no probing)', async () => {
    await update(targetId, { disabled: true });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong password' });

    expect(res.status).toBe(401);
  });

  it('re-enabling lets the user log in again', async () => {
    await update(targetId, { disabled: true });

    const res = await update(targetId, { disabled: false });

    expect(res.body.disabledAt).toBeNull();
    expect((await login()).status).toBe(200);
  });

  it('disabling twice keeps the original date', async () => {
    const first = await update(targetId, { disabled: true });

    const second = await update(targetId, { disabled: true });

    expect(second.body.disabledAt).toBe(first.body.disabledAt);
  });

  it('refresh fails for a disabled user even if a token survived', async () => {
    const session = (await login()).body;
    // Disable directly in the DB, skipping the token revoke.
    await prisma.user.update({
      where: { id: targetId },
      data: { disabledAt: new Date() },
    });

    expect((await refresh(session.refreshToken)).status).toBe(401);
  });

  it('an empty body changes nothing', async () => {
    const res = await update(targetId, {});

    expect(res.body).toMatchObject({ role: 'USER', disabledAt: null });
  });

  // Lockout rule.
  it.each([
    ['demote', { role: 'USER' }],
    ['disable', { disabled: true }],
  ])('400 when an admin tries to %s themselves', async (_label, body) => {
    const res = await update(adminId, body);

    expect(res.status).toBe(400);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(me).toMatchObject({ role: 'ADMIN', disabledAt: null });
  });

  it.each([
    ['role unknown', { role: 'GOD' }],
    ['disabled not a boolean', { disabled: 'yes' }],
  ])('400 when %s', async (_label, body) => {
    const res = await update(targetId, body);

    expect(res.status).toBe(400);
  });

  it.each([
    ['not a UUID', 'nope'],
    ['valid UUID, no row', MISSING_ID],
  ])('404 for unknown id (%s)', async (_label, id) => {
    const res = await update(id, { role: 'ADMIN' });

    expect(res.status).toBe(404);
  });

  it('403 for a normal USER', async () => {
    const res = await request(app)
      .patch(`${USERS}/${adminId}`)
      .set('Authorization', await authHeader(targetId))
      .send({ role: 'USER' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/stats', () => {
  it('counts users, workouts and recent signups', async () => {
    const recent = await createUser();
    const old = await createUser();
    await prisma.user.update({
      where: { id: old.id },
      data: { createdAt: new Date('2025-01-01T00:00:00Z') },
    });
    await prisma.workout.createMany({
      data: [
        { name: 'Run', durationMin: 30, userId: recent.id },
        { name: 'Yoga', durationMin: 20, userId: old.id },
      ],
    });

    const res = await asAdmin('/api/v1/admin/stats');

    // admin + recent + old = 3 users; old one is outside the 7 days.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      users: 3,
      workouts: 2,
      newUsersLast7Days: 2,
    });
  });
});
