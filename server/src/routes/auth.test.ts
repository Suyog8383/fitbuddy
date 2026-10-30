import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../app.ts';
import { prisma } from '../db.ts';
import { verifyPassword } from '../lib/password.ts';
import { hashRefreshToken, issueRefreshToken } from '../lib/refreshTokens.ts';
import { verifyAccessToken } from '../lib/tokens.ts';
import { sentEmails } from '../lib/email.ts';
import {
  authHeader,
  createUser,
  lastCodeSentTo,
  TEST_PASSWORD,
} from '../test/factories.ts';

const REGISTER = '/api/v1/auth/register';
const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const LOGOUT = '/api/v1/auth/logout';
const LOGOUT_ALL = '/api/v1/auth/logout-all';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const RESEND = '/api/v1/auth/resend-verification';
const FORGOT = '/api/v1/auth/forgot-password';
const RESET = '/api/v1/auth/reset-password';

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
  it('returns 200 with the user (no hash) and an access token for them', async () => {
    const user = await createUser({ email: 'suyog@mail.com' });

    const res = await request(app)
      .post(LOGIN)
      .send({ email: 'suyog@mail.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: 'suyog@mail.com',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    // The token really belongs to this user.
    await expect(verifyAccessToken(res.body.accessToken)).resolves.toBe(
      user.id,
    );
  });

  it('also returns a refresh token, stored only as a hash', async () => {
    await createUser({ email: 'suyog@mail.com' });

    const res = await request(app)
      .post(LOGIN)
      .send({ email: 'suyog@mail.com', password: TEST_PASSWORD });

    expect(res.body.refreshToken).toEqual(expect.any(String));
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(res.body.refreshToken) },
    });
    expect(row).not.toBeNull();
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

// Real login for an existing user -> { user, accessToken, refreshToken }.
// Each call = a new session, like logging in on another device.
async function loginAs(email: string) {
  const res = await request(app)
    .post(LOGIN)
    .send({ email, password: TEST_PASSWORD });
  return res.body;
}

// New user + one login.
async function login() {
  await createUser({ email: 'suyog@mail.com' });
  return loginAs('suyog@mail.com');
}

const refresh = (refreshToken: unknown) =>
  request(app).post(REFRESH).send({ refreshToken });

describe('POST /api/v1/auth/refresh', () => {
  it('returns a new access token and a new refresh token', async () => {
    const { user, refreshToken } = await login();

    const res = await refresh(refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);
    await expect(verifyAccessToken(res.body.accessToken)).resolves.toBe(
      user.id,
    );
  });

  it('the new access token works on a protected route', async () => {
    const { refreshToken } = await login();
    const { body } = await refresh(refreshToken);

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${body.accessToken}`);

    expect(res.status).toBe(200);
  });

  it('keeps working along a rotation chain (R1 -> R2 -> R3)', async () => {
    const { refreshToken: r1 } = await login();

    const r2 = (await refresh(r1)).body.refreshToken;
    const res = await refresh(r2);

    expect(res.status).toBe(200);
  });

  // Theft scenario: R1 rotated to R2, then someone presents R1 again.
  // Both R1 and R2 must die -> the real user logs in again with a password,
  // the attacker is locked out.
  it('on reuse of an old token, revokes the whole family', async () => {
    const { refreshToken: r1 } = await login();
    const r2 = (await refresh(r1)).body.refreshToken;

    const reuse = await refresh(r1);
    const afterReuse = await refresh(r2);

    expect(reuse.status).toBe(401);
    expect(afterReuse.status).toBe(401);
  });

  it('gives the same 401 for unknown, expired and reused tokens', async () => {
    const { refreshToken } = await login();
    await refresh(refreshToken); // now used
    const expired = await issueRefreshToken((await createUser()).id);
    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const responses = await Promise.all([
      refresh('made-up-token'),
      refresh(expired),
      refresh(refreshToken),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid refresh token' });
    }
  });

  it('does not accept an access token as a refresh token', async () => {
    const { accessToken } = await login();

    const res = await refresh(accessToken);

    expect(res.status).toBe(401);
  });

  it('fails after the account is deleted (tokens cascade)', async () => {
    const { user, refreshToken } = await login();
    await prisma.user.delete({ where: { id: user.id } });

    const res = await refresh(refreshToken);

    expect(res.status).toBe(401);
  });

  it.each([
    ['no body', undefined],
    ['missing refreshToken', {}],
    ['refreshToken not a string', { refreshToken: 123 }],
    ['empty refreshToken', { refreshToken: '' }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post(REFRESH).send(body);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/logout', () => {
  const logout = (refreshToken: unknown) =>
    request(app).post(LOGOUT).send({ refreshToken });

  it('returns 204 and the refresh token stops working', async () => {
    const { refreshToken } = await login();

    const res = await logout(refreshToken);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  // Logout with an older token of the chain still ends the session:
  // the whole family is revoked, including the latest token.
  it('revokes the whole family, not just the given token', async () => {
    const { refreshToken: r1 } = await login();
    const r2 = (await refresh(r1)).body.refreshToken;

    await logout(r1);

    expect((await refresh(r2)).status).toBe(401);
  });

  it('logs out only this device', async () => {
    const phone = await login();
    const tablet = await loginAs('suyog@mail.com');

    await logout(phone.refreshToken);

    expect((await refresh(tablet.refreshToken)).status).toBe(200);
  });

  it('returns 204 for an unknown token (reveals nothing)', async () => {
    const res = await logout('made-up-token');

    expect(res.status).toBe(204);
  });

  it('returns 204 when logging out twice', async () => {
    const { refreshToken } = await login();
    await logout(refreshToken);

    const res = await logout(refreshToken);

    expect(res.status).toBe(204);
  });

  it.each([
    ['no body', undefined],
    ['missing refreshToken', {}],
    ['refreshToken not a string', { refreshToken: 123 }],
    ['empty refreshToken', { refreshToken: '' }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post(LOGOUT).send(body);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/logout-all', () => {
  it('revokes the refresh tokens on every device', async () => {
    const phone = await login();
    const tablet = await loginAs('suyog@mail.com');

    const res = await request(app)
      .post(LOGOUT_ALL)
      .set('Authorization', `Bearer ${phone.accessToken}`);

    expect(res.status).toBe(204);
    expect((await refresh(phone.refreshToken)).status).toBe(401);
    expect((await refresh(tablet.refreshToken)).status).toBe(401);
  });

  it("leaves other users' sessions alone", async () => {
    const me = await login();
    await createUser({ email: 'other@mail.com' });
    const other = await loginAs('other@mail.com');

    await request(app)
      .post(LOGOUT_ALL)
      .set('Authorization', `Bearer ${me.accessToken}`);

    expect((await refresh(other.refreshToken)).status).toBe(200);
  });

  it('returns 401 without an access token', async () => {
    const res = await request(app).post(LOGOUT_ALL);

    expect(res.status).toBe(401);
  });

  // A refresh token is not an access token — it can't authorize requests.
  it('returns 401 with a refresh token as the Bearer token', async () => {
    const { refreshToken } = await login();

    const res = await request(app)
      .post(LOGOUT_ALL)
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(res.status).toBe(401);
  });
});

// Real register + login: the verification email lands in the test inbox.
async function registerAndLogin() {
  await request(app).post(REGISTER).send(valid);
  const { user, accessToken } = await loginAs(valid.email);
  return { user, auth: `Bearer ${accessToken}` };
}

describe('email verification', () => {
  const verify = (auth: string, code: unknown) =>
    request(app).post(VERIFY_EMAIL).set('Authorization', auth).send({ code });

  it('register emails a 6-digit code; the user starts unverified', async () => {
    const res = await request(app).post(REGISTER).send(valid);

    expect(res.body.emailVerifiedAt).toBeNull();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: valid.email,
      subject: 'Verify your FitBuddy email',
    });
    expect(lastCodeSentTo(valid.email)).toMatch(/^\d{6}$/);
  });

  it('verifies with the emailed code; /users/me shows it', async () => {
    const { auth } = await registerAndLogin();

    const res = await verify(auth, lastCodeSentTo(valid.email));

    expect(res.status).toBe(204);
    const me = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', auth);
    expect(me.body.emailVerifiedAt).toEqual(expect.any(String));
  });

  it('rejects a wrong code with 400 and stays unverified', async () => {
    const { user, auth } = await registerAndLogin();
    const code = lastCodeSentTo(valid.email);

    const res = await verify(auth, code === '000000' ? '111111' : '000000');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid or expired code' });
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(stored.emailVerifiedAt).toBeNull();
  });

  it('a code works only once', async () => {
    const { auth } = await registerAndLogin();
    const code = lastCodeSentTo(valid.email);
    await verify(auth, code);
    // Un-verify so the second call really tries the code again.
    await prisma.user.updateMany({ data: { emailVerifiedAt: null } });

    const res = await verify(auth, code);

    expect(res.status).toBe(400);
  });

  it('returns 204 when already verified (idempotent)', async () => {
    const { auth } = await registerAndLogin();
    await verify(auth, lastCodeSentTo(valid.email));

    const res = await verify(auth, '123456');

    expect(res.status).toBe(204);
  });

  it.each([
    ['missing', undefined],
    ['a number', 123456],
    ['too short', '12345'],
    ['not digits', '12a456'],
  ])('returns 400 when the code is %s', async (_label, code) => {
    const { auth } = await registerAndLogin();

    const res = await verify(auth, code);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'code must be 6 digits' });
  });

  it('returns 401 without an access token', async () => {
    const res = await request(app).post(VERIFY_EMAIL).send({ code: '123456' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/resend-verification', () => {
  const resend = (auth: string) =>
    request(app).post(RESEND).set('Authorization', auth);

  it('emails a new code; the old one stops working', async () => {
    const { auth } = await registerAndLogin();
    const oldCode = lastCodeSentTo(valid.email);

    const res = await resend(auth);
    const newCode = lastCodeSentTo(valid.email);

    expect(res.status).toBe(204);
    expect(sentEmails).toHaveLength(2);
    // Codes are random: a 1-in-a-million chance they match, so only test
    // the old one when it differs.
    if (newCode !== oldCode) {
      const old = await request(app)
        .post(VERIFY_EMAIL)
        .set('Authorization', auth)
        .send({ code: oldCode });
      expect(old.status).toBe(400);
    }
    const ok = await request(app)
      .post(VERIFY_EMAIL)
      .set('Authorization', auth)
      .send({ code: newCode });
    expect(ok.status).toBe(204);
  });

  it('sends nothing when already verified', async () => {
    const user = await createUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    const res = await resend(await authHeader(user.id));

    expect(res.status).toBe(204);
    expect(sentEmails).toHaveLength(0);
  });

  it('returns 401 without an access token', async () => {
    const res = await request(app).post(RESEND);

    expect(res.status).toBe(401);
  });
});

describe('password reset', () => {
  const EMAIL = 'suyog@mail.com';
  const NEW_PASSWORD = 'brand new password';

  const forgot = (email: unknown) => request(app).post(FORGOT).send({ email });
  const reset = (body: object) =>
    request(app)
      .post(RESET)
      .send({ email: EMAIL, newPassword: NEW_PASSWORD, ...body });

  // forgot-password doesn't await the send -> the email may arrive just
  // after the 204. waitFor retries until the code is in the inbox.
  async function requestCode(email = EMAIL) {
    const res = await forgot(email);
    expect(res.status).toBe(204);
    return vi.waitFor(() => lastCodeSentTo(email));
  }

  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  it('resets the password: old one fails, new one works', async () => {
    await createUser({ email: EMAIL });
    const code = await requestCode();

    const res = await reset({ code });

    expect(res.status).toBe(204);
    const oldLogin = await request(app)
      .post(LOGIN)
      .send({ email: EMAIL, password: TEST_PASSWORD });
    const newLogin = await request(app)
      .post(LOGIN)
      .send({ email: EMAIL, password: NEW_PASSWORD });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });

  it('emails a reset code (not a verification code)', async () => {
    await createUser({ email: EMAIL });

    await requestCode();

    expect(sentEmails.at(-1)?.subject).toBe('Reset your FitBuddy password');
  });

  it('logs out every device', async () => {
    await createUser({ email: EMAIL });
    const phone = await loginAs(EMAIL);
    const tablet = await loginAs(EMAIL);

    await reset({ code: await requestCode() });

    expect((await refresh(phone.refreshToken)).status).toBe(401);
    expect((await refresh(tablet.refreshToken)).status).toBe(401);
  });

  it('also verifies the email (the code proves inbox ownership)', async () => {
    const user = await createUser({ email: EMAIL });

    await reset({ code: await requestCode() });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(stored.emailVerifiedAt).not.toBeNull();
  });

  it('keeps the original verification date', async () => {
    const verifiedAt = new Date('2026-01-01T00:00:00Z');
    const user = await createUser({ email: EMAIL });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: verifiedAt },
    });

    await reset({ code: await requestCode() });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(stored.emailVerifiedAt).toEqual(verifiedAt);
  });

  it('forgot-password: 204 and no email for an unknown address', async () => {
    const res = await forgot('nobody@mail.com');

    expect(res.status).toBe(204);
    // Give a (wrongly) fire-and-forget send time to land before checking.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sentEmails).toHaveLength(0);
  });

  it('a wrong code changes nothing', async () => {
    await createUser({ email: EMAIL });
    const code = await requestCode();
    const session = await loginAs(EMAIL);

    const res = await reset({ code: wrong(code) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid or expired code' });
    const login = await request(app)
      .post(LOGIN)
      .send({ email: EMAIL, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect((await refresh(session.refreshToken)).status).toBe(200);
  });

  it('a code works only once', async () => {
    await createUser({ email: EMAIL });
    const code = await requestCode();
    await reset({ code });

    const res = await reset({ code, newPassword: 'another new password' });

    expect(res.status).toBe(400);
  });

  it('kills the code after 5 wrong attempts', async () => {
    await createUser({ email: EMAIL });
    const code = await requestCode();
    for (let i = 0; i < 5; i++) {
      await reset({ code: wrong(code) });
    }

    const res = await reset({ code });

    expect(res.status).toBe(400);
  });

  it('a verification code cannot reset the password', async () => {
    await request(app).post(REGISTER).send(valid); // emails a VERIFY code

    const res = await reset({ code: lastCodeSentTo(valid.email) });

    expect(res.status).toBe(400);
  });

  it('unknown email gets the same 400 as a wrong code', async () => {
    const res = await reset({ email: 'nobody@mail.com', code: '123456' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid or expired code' });
  });

  it.each([
    ['email missing', { email: undefined, code: '123456' }],
    ['code missing', { code: undefined }],
    ['code not 6 digits', { code: '1234' }],
    ['newPassword missing', { code: '123456', newPassword: undefined }],
    ['newPassword too short', { code: '123456', newPassword: 'short' }],
  ])('reset-password returns 400 when %s', async (_label, body) => {
    const res = await reset(body);

    expect(res.status).toBe(400);
  });

  it.each([
    ['missing', undefined],
    ['not an email', 'not-an-email'],
  ])('forgot-password returns 400 when email is %s', async (_label, email) => {
    const res = await forgot(email);

    expect(res.status).toBe(400);
  });
});
