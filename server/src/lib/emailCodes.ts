import { createHash, randomInt } from 'node:crypto';
import { prisma } from '../db.ts';
import type { EmailCodePurpose, Prisma } from '../generated/prisma/client.ts';

// 6-digit one-time codes for email verification and password reset.
// 1,000,000 options is guessable, so four rules make it safe:
// short expiry, attempt limit, single use, one active code per purpose.

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

// Fast hash is fine: see the schema comment on EmailCode.codeHash.
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Normal client or a transaction's `tx` (same idea as refreshTokens.ts).
type Db = typeof prisma | Prisma.TransactionClient;

// Creates a new code and returns it (to be emailed). Any older unused
// code for the same user + purpose dies, so only the latest email works.
export async function issueCode(
  userId: string,
  purpose: EmailCodePurpose,
): Promise<string> {
  // randomInt = crypto-secure. Math.random() is predictable — never for secrets.
  // padStart: 42 -> "000042", always 6 digits.
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const now = new Date();

  // Array form of $transaction: independent queries, run in order, all or
  // nothing. (The callback form, used in refreshTokens.ts, is for when a
  // later query depends on an earlier result.)
  await prisma.$transaction([
    prisma.emailCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.emailCode.create({
      data: {
        userId,
        purpose,
        codeHash: hashCode(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  return code;
}

// true = correct code, now used up. false = wrong, expired, used, too many
// attempts, or no code at all — callers answer the same for every case.
// Accepts `db` so reset-password can run it inside its own transaction.
export async function consumeCode(
  userId: string,
  purpose: EmailCodePurpose,
  code: string,
  db: Db = prisma,
): Promise<boolean> {
  const now = new Date();

  const row = await db.emailCode.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return false;

  // Spend an attempt BEFORE comparing. Conditional update -> the DB counts,
  // not us: 100 parallel guesses can't all read "attempts = 0" and each
  // get a try. At most MAX_ATTEMPTS comparisons can ever happen.
  const spent = await db.emailCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (spent.count === 0) return false; // out of attempts

  if (hashCode(code) !== row.codeHash) return false;

  // Single use: only one of two parallel correct guesses gets count 1.
  const used = await db.emailCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  return used.count === 1;
}
