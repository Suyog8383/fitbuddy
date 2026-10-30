import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { verifyPassword } from '../lib/password.ts';
import { createUser, TEST_PASSWORD } from '../test/factories.ts';

const REGISTER = '/api/v1/auth/register';
const LOGIN = '/api/v1/auth/login';

const valid = {
  email: 'suyog@mail.com',
  name: 'Suyog',
  password: 'correct horse battery',
};

describe('POST /api/v1/auth/register', () => {
  it('creates a user and returns 201 without the password hash', async () => {
    const res = await request(app)
      .post(REGISTER)
      .send({ ...valid, email: '  Suyog@Mail.com ', name: ' Suyog ' });

    expect(res.status).toBe(201);
    // email trimmed + lowercased, name trimmed
    expect(res.body).toMatchObject({ email: 'suyog@mail.com', name: 'Suyog' });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(valid.password);
  });

  it('stores a bcrypt hash, never the password', async () => {
    const res = await request(app).post(REGISTER).send(valid);

    // omit: { passwordHash: false } = explicitly ask for the hidden field.
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: res.body.id },
      omit: { passwordHash: false },
    });
    expect(stored.passwordHash).not.toBe(valid.password);
    expect(stored.passwordHash).toMatch(/^\$2b\$12\$/); // bcrypt, cost 12
    expect(await verifyPassword(valid.password, stored.passwordHash)).toBe(
      true,
    );
  });

  it('gives the same password a different hash each time (salt)', async () => {
    const a = await request(app).post(REGISTER).send(valid);
    const b = await request(app)
      .post(REGISTER)
      .send({ ...valid, email: 'other@mail.com' });

    const hashes = await prisma.user.findMany({
      where: { id: { in: [a.body.id, b.body.id] } },
      omit: { passwordHash: false },
    });
    expect(hashes[0].passwordHash).not.toBe(hashes[1].passwordHash);
  });

  it.each([
    ['no body', undefined],
    ['invalid email', { ...valid, email: 'nope' }],
    ['missing name', { ...valid, name: undefined }],
    ['missing password', { ...valid, password: undefined }],
    ['password not a string', { ...valid, password: 12345678 }],
    ['password too short', { ...valid, password: '1234567' }],
    ['password over 72 bytes', { ...valid, password: 'a'.repeat(73) }],
    // 19 emoji = 19 "characters" in a person's eyes, but 76 bytes
    ['password over 72 bytes (emoji)', { ...valid, password: '🔥'.repeat(19) }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post(REGISTER).send(body);

    expect(res.status).toBe(400);
  });

  it('accepts a 72-byte password with spaces', async () => {
    const password = 'a b '.repeat(18); // 72 bytes, spaces kept as-is
    const res = await request(app)
      .post(REGISTER)
      .send({ ...valid, password });

    expect(res.status).toBe(201);
  });

  it('returns 409 when the email is already used (any letter case)', async () => {
    await createUser({ email: 'suyog@mail.com' });

    const res = await request(app)
      .post(REGISTER)
      .send({ ...valid, email: 'SUYOG@mail.com' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email already in use' });
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and the user (no hash) for the right password', async () => {
    const user = await createUser({ email: 'suyog@mail.com' });

    const res = await request(app)
      .post(LOGIN)
      .send({ email: 'suyog@mail.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, email: 'suyog@mail.com' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('matches the email in any letter case, with spaces around it', async () => {
    await createUser({ email: 'suyog@mail.com' });

    const res = await request(app)
      .post(LOGIN)
      .send({ email: '  SUYOG@Mail.com ', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('works end to end with a freshly registered user', async () => {
    await request(app).post(REGISTER).send(valid);

    const res = await request(app)
      .post(LOGIN)
      .send({ email: valid.email, password: valid.password });

    expect(res.status).toBe(200);
  });

  // Enumeration: "wrong password" and "no such email" must be
  // indistinguishable — same status, same body.
  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await createUser({ email: 'suyog@mail.com' });

    const wrongPassword = await request(app)
      .post(LOGIN)
      .send({ email: 'suyog@mail.com', password: 'not the password' });
    const unknownEmail = await request(app)
      .post(LOGIN)
      .send({ email: 'nobody@mail.com', password: TEST_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({ error: 'Invalid email or password' });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('is case-sensitive for the password', async () => {
    await createUser({ email: 'suyog@mail.com' });

    const res = await request(app)
      .post(LOGIN)
      .send({ email: 'suyog@mail.com', password: TEST_PASSWORD.toUpperCase() });

    expect(res.status).toBe(401);
  });

  it.each([
    ['no body', undefined],
    ['missing email', { password: TEST_PASSWORD }],
    ['missing password', { email: 'suyog@mail.com' }],
    ['password not a string', { email: 'suyog@mail.com', password: 123 }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post(LOGIN).send(body);

    expect(res.status).toBe(400);
  });
});
