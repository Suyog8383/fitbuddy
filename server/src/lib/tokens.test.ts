import { describe, expect, it } from 'vitest';
import { SignJWT, UnsecuredJWT, decodeJwt } from 'jose';
import { signAccessToken, verifyAccessToken } from './tokens.ts';

// Each test builds a "bad" token the way an attacker or a bug would,
// and checks verifyAccessToken refuses it.

const USER_ID = '19947659-5395-44c3-a736-24ad91836126';
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

// A correctly signed token we can tweak one field at a time.
function forge(
  edit: (jwt: SignJWT) => SignJWT = (jwt) => jwt,
  key: Uint8Array = secret,
) {
  const jwt = new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('fitbuddy-api')
    .setAudience('fitbuddy-app');
  return edit(jwt).sign(key);
}

describe('signAccessToken', () => {
  it('puts only the user id + standard claims in the payload', async () => {
    const token = await signAccessToken(USER_ID);

    // decodeJwt does NOT verify — it just reads. Anyone can do this.
    const payload = decodeJwt(token);
    expect(Object.keys(payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'sub'].sort(),
    );
    expect(payload.sub).toBe(USER_ID);
    expect(payload.exp! - payload.iat!).toBe(15 * 60); // 15 minutes
  });
});

describe('verifyAccessToken', () => {
  it('returns the user id for a valid token', async () => {
    const token = await signAccessToken(USER_ID);

    await expect(verifyAccessToken(token)).resolves.toBe(USER_ID);
  });

  it('accepts a token built the same way (sanity check for forge)', async () => {
    await expect(verifyAccessToken(await forge())).resolves.toBe(USER_ID);
  });

  it.each([
    ['expired', () => forge((jwt) => jwt.setExpirationTime('-1s'))],
    [
      'signed with a different secret',
      () => forge(undefined, new TextEncoder().encode('x'.repeat(40))),
    ],
    ['wrong issuer', () => forge((jwt) => jwt.setIssuer('evil-api'))],
    ['wrong audience', () => forge((jwt) => jwt.setAudience('other-app'))],
    [
      'alg none (unsigned)',
      async () =>
        new UnsecuredJWT({ sub: USER_ID })
          .setIssuer('fitbuddy-api')
          .setAudience('fitbuddy-app')
          .setExpirationTime('15m')
          .encode(),
    ],
    [
      'no exp claim',
      () =>
        new SignJWT()
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(USER_ID)
          .setIssuer('fitbuddy-api')
          .setAudience('fitbuddy-app')
          .sign(secret),
    ],
    [
      'no sub claim',
      () =>
        new SignJWT()
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('15m')
          .setIssuer('fitbuddy-api')
          .setAudience('fitbuddy-app')
          .sign(secret),
    ],
    ['garbage', async () => 'not.a.jwt'],
  ])('rejects a token that is %s', async (_label, makeToken) => {
    await expect(verifyAccessToken(await makeToken())).rejects.toThrow();
  });

  it('rejects a tampered payload (user id swapped, old signature kept)', async () => {
    const [header, , signature] = (await signAccessToken(USER_ID)).split('.');
    // Attacker re-encodes the payload with someone else's id.
    const evilPayload = Buffer.from(
      JSON.stringify({ ...decodeJwt(await forge()), sub: 'someone-else' }),
    ).toString('base64url');

    await expect(
      verifyAccessToken(`${header}.${evilPayload}.${signature}`),
    ).rejects.toThrow();
  });
});
