import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.ts';
import { createUser } from '../test/factories.ts';
import {
  REFRESH_TOKEN_TTL_DAYS,
  hashRefreshToken,
  issueRefreshToken,
  rotateRefreshToken,
} from './refreshTokens.ts';

let userId: string;

beforeEach(async () => {
  userId = (await createUser()).id;
});

function findRow(token: string) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });
}

describe('issueRefreshToken', () => {
  it('stores only the hash, with a 30-day expiry', async () => {
    const token = await issueRefreshToken(userId);

    const row = await findRow(token);
    expect(row).not.toBeNull();
    expect(row!.tokenHash).not.toBe(token); // never the raw token
    const days = (row!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeCloseTo(REFRESH_TOKEN_TTL_DAYS, 1);
  });

  it('starts a new family per login', async () => {
    const a = await findRow(await issueRefreshToken(userId));
    const b = await findRow(await issueRefreshToken(userId));

    expect(a!.familyId).not.toBe(b!.familyId);
  });
});

describe('rotateRefreshToken', () => {
  it('returns a new token in the same family and marks the old one used', async () => {
    const old = await issueRefreshToken(userId);

    const result = await rotateRefreshToken(old);

    expect(result).toMatchObject({ ok: true, userId });
    if (!result.ok) return; // narrows the type for TypeScript
    expect(result.refreshToken).not.toBe(old);
    const oldRow = await findRow(old);
    const newRow = await findRow(result.refreshToken);
    expect(oldRow!.usedAt).not.toBeNull();
    expect(newRow!.familyId).toBe(oldRow!.familyId);
  });

  it('rejects an unknown token', async () => {
    expect(await rotateRefreshToken('made-up')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('rejects an expired token', async () => {
    const token = await issueRefreshToken(userId);
    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await rotateRefreshToken(token)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  // R1 -> R2 (honest rotation). Then R1 shows up again: someone kept a
  // copy. Kill the whole chain, including R2.
  it('detects reuse and revokes the whole family', async () => {
    const r1 = await issueRefreshToken(userId);
    const rotated = await rotateRefreshToken(r1);
    if (!rotated.ok) throw new Error('first rotation should succeed');
    const r2 = rotated.refreshToken;

    expect(await rotateRefreshToken(r1)).toEqual({
      ok: false,
      reason: 'reused',
    });
    expect(await rotateRefreshToken(r2)).toEqual({
      ok: false,
      reason: 'revoked',
    });
  });

  it('leaves other families (other devices) alone on reuse', async () => {
    const phone = await issueRefreshToken(userId);
    const tablet = await issueRefreshToken(userId);
    await rotateRefreshToken(phone);
    await rotateRefreshToken(phone); // reuse -> phone family revoked

    const result = await rotateRefreshToken(tablet);

    expect(result.ok).toBe(true);
  });

  // Two requests with the same token at the same moment: exactly one wins.
  it('lets only one of two parallel rotations succeed', async () => {
    const token = await issueRefreshToken(userId);

    const results = await Promise.all([
      rotateRefreshToken(token),
      rotateRefreshToken(token),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
