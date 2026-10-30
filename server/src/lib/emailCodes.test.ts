import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db.ts';
import { EmailCodePurpose } from '../generated/prisma/client.ts';
import { createUser } from '../test/factories.ts';
import {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  consumeCode,
  issueCode,
} from './emailCodes.ts';

const VERIFY = EmailCodePurpose.EMAIL_VERIFICATION;
const RESET = EmailCodePurpose.PASSWORD_RESET;

let userId: string;

beforeEach(async () => {
  userId = (await createUser()).id;
});

// A code guaranteed to differ from `code`.
const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

describe('issueCode', () => {
  it('returns 6 digits and stores only a hash, expiring in 15 minutes', async () => {
    const code = await issueCode(userId, VERIFY);

    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.emailCode.findFirstOrThrow({ where: { userId } });
    expect(row.codeHash).not.toContain(code);
    const minutes = (row.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeCloseTo(CODE_TTL_MINUTES, 0);
  });

  it('kills the previous code: only the latest email works', async () => {
    const first = await issueCode(userId, VERIFY);
    const second = await issueCode(userId, VERIFY);

    expect(await consumeCode(userId, VERIFY, first)).toBe(false);
    expect(await consumeCode(userId, VERIFY, second)).toBe(true);
  });

  it('does not touch codes of the other purpose', async () => {
    const reset = await issueCode(userId, RESET);
    await issueCode(userId, VERIFY);

    expect(await consumeCode(userId, RESET, reset)).toBe(true);
  });
});

describe('consumeCode', () => {
  it('accepts the right code once (single use)', async () => {
    const code = await issueCode(userId, VERIFY);

    expect(await consumeCode(userId, VERIFY, code)).toBe(true);
    expect(await consumeCode(userId, VERIFY, code)).toBe(false);
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const code = await issueCode(userId, VERIFY);

    expect(await consumeCode(userId, VERIFY, wrong(code))).toBe(false);
    const row = await prisma.emailCode.findFirstOrThrow({ where: { userId } });
    expect(row.attempts).toBe(1);
  });

  it(`kills the code after ${MAX_ATTEMPTS} wrong attempts`, async () => {
    const code = await issueCode(userId, VERIFY);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await consumeCode(userId, VERIFY, wrong(code));
    }

    // Even the right code is refused now.
    expect(await consumeCode(userId, VERIFY, code)).toBe(false);
  });

  it('rejects an expired code', async () => {
    const code = await issueCode(userId, VERIFY);
    await prisma.emailCode.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await consumeCode(userId, VERIFY, code)).toBe(false);
  });

  it('rejects a code issued for the other purpose', async () => {
    const code = await issueCode(userId, VERIFY);

    expect(await consumeCode(userId, RESET, code)).toBe(false);
  });

  it("rejects another user's code", async () => {
    const other = await createUser();
    const code = await issueCode(other.id, VERIFY);

    expect(await consumeCode(userId, VERIFY, code)).toBe(false);
  });

  it('returns false when no code was ever issued', async () => {
    expect(await consumeCode(userId, VERIFY, '123456')).toBe(false);
  });

  // Brute force in parallel: 20 guesses at once must still get only
  // MAX_ATTEMPTS comparisons — the DB counts, not each request's own read.
  it('caps attempts even for parallel guesses', async () => {
    const code = await issueCode(userId, VERIFY);

    await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeCode(userId, VERIFY, wrong(code)),
      ),
    );

    const row = await prisma.emailCode.findFirstOrThrow({ where: { userId } });
    expect(row.attempts).toBe(MAX_ATTEMPTS);
  });

  it('lets only one of several parallel correct guesses succeed', async () => {
    const code = await issueCode(userId, VERIFY);

    const results = await Promise.all(
      Array.from({ length: 3 }, () => consumeCode(userId, VERIFY, code)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
