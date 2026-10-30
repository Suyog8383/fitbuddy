import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.ts';

// HS256 = HMAC-SHA256: one secret both signs and verifies.
const ALGORITHM = 'HS256';
// Short-lived on purpose: a stolen token can't be revoked, so it must die
// soon on its own. 3C adds a refresh token so users don't re-login.
export const ACCESS_TOKEN_TTL = '15m';
// Who made the token / who it's for. A token signed for another app (even
// with the same secret by mistake) fails verification.
const ISSUER = 'fitbuddy-api';
const AUDIENCE = 'fitbuddy-app';

// jose wants the secret as bytes, not a string.
const secret = new TextEncoder().encode(env.JWT_SECRET);

// Payload = only the user id (`sub`). The payload is NOT encrypted —
// anyone can decode it — so no email, no health data, nothing secret.
export function signAccessToken(userId: string): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(secret);
}

// Checks format, algorithm, signature, exp, iss and aud — in that spirit:
// trust nothing in the token until all of them pass.
// Throws if anything is wrong; returns the user id if all is good.
export async function verifyAccessToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret, {
    // Only HS256. Blocks `alg: none` and algorithm-confusion attacks:
    // the token can't choose how it gets verified.
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
    // Without this, a token with no `exp` would never expire.
    requiredClaims: ['sub', 'exp'],
  });

  return payload.sub as string; // guaranteed by requiredClaims
}
