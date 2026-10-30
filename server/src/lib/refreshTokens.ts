import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../db.ts';
import type { Prisma } from '../generated/prisma/client.ts';

// Refresh token = 32 random bytes, sent ONLY to /auth/refresh and /auth/logout.
// Not a JWT: the DB row decides if it's valid, so a signature adds nothing.

// Sliding window: every rotation issues a fresh 30-day token, so an active
// user stays logged in; 30 days of no use -> log in again.
export const REFRESH_TOKEN_TTL_DAYS = 30;
const TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

// SHA-256, not bcrypt: the token is 256 random bits, so it can't be guessed
// even with a fast hash. Fast + deterministic = we can find the row by hash.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Either the normal client or the `tx` inside prisma.$transaction —
// lets the same function run alone or as part of a transaction.
type Db = typeof prisma | Prisma.TransactionClient;

// Creates a token row and returns the raw token. The raw token exists only
// here and in the response; the DB keeps just its hash.
// New login -> new family. Rotation -> pass the old token's familyId.
export async function issueRefreshToken(
  userId: string,
  familyId: string = randomUUID(),
  db: Db = prisma,
): Promise<string> {
  // base64url: URL/JSON-safe characters, no padding.
  const token = randomBytes(32).toString('base64url');

  await db.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(token),
      familyId,
      userId,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  return token;
}

// Revokes every still-active token in one login's chain.
// Used on reuse detection, and by logout.
export async function revokeFamily(
  familyId: string,
  db: Db = prisma,
): Promise<void> {
  await db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Discriminated union: `ok` tells TypeScript which fields exist.
// The route answers the same 401 for every failure; `reason` is for logs.
export type RotateResult =
  | { ok: true; userId: string; refreshToken: string }
  | { ok: false; reason: 'unknown' | 'revoked' | 'reused' | 'expired' };

// Single use: marks the old token used and issues a new one in the same
// family. Presenting an already-used token = theft signal -> revoke family.
export async function rotateRefreshToken(token: string): Promise<RotateResult> {
  const now = new Date();
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });

  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  // Checked before expiry: an old used token may be expired, but the
  // token that replaced it may still be alive in the attacker's hands.
  if (row.usedAt) {
    await revokeFamily(row.familyId);
    return { ok: false, reason: 'reused' };
  }
  if (row.expiresAt <= now) return { ok: false, reason: 'expired' };

  // Both writes or neither: a crash between them can't leave the old token
  // used with no new one issued (user logged out for nothing).
  return prisma.$transaction(async (tx) => {
    // Conditional update = "mark used ONLY IF still unused". The DB decides,
    // not our earlier read: two parallel requests with the same token both
    // passed the checks above, but only one gets count === 1.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });

    if (count === 0) {
      // Lost the race: someone used this token a moment ago -> reuse.
      await revokeFamily(row.familyId, tx);
      return { ok: false, reason: 'reused' } as const;
    }

    const refreshToken = await issueRefreshToken(row.userId, row.familyId, tx);
    return { ok: true, userId: row.userId, refreshToken } as const;
  });
}
