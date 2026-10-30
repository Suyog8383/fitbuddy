import bcrypt from 'bcrypt';
import { prisma } from '../db.ts';
import { sentEmails } from '../lib/email.ts';
import { signAccessToken } from '../lib/tokens.ts';

// Test data builders: create rows straight in the DB with sensible defaults.

export const TEST_PASSWORD = 'correct horse battery';

// Hashed ONCE when this file loads, at the lowest cost (4) — real cost 12
// would add ~250 ms per created user. verifyPassword still works: the
// cost is read from the hash string itself.
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

let counter = 0;

// Unique email per call, so tests can create several users.
export function createUser(
  data: Partial<{ email: string; name: string }> = {},
) {
  counter += 1;
  return prisma.user.create({
    data: {
      email: `user${counter}@test.com`,
      name: `User ${counter}`,
      passwordHash: TEST_PASSWORD_HASH,
      ...data,
    },
  });
}

// Authorization header value for a user: `.set('Authorization', await
// authHeader(user.id))`. Signs a token directly — faster than calling
// /auth/login (bcrypt) in every test. Login itself is tested in auth.test.ts.
export async function authHeader(userId: string): Promise<string> {
  return `Bearer ${await signAccessToken(userId)}`;
}

// The 6-digit code in the newest email sent to `to` (test inbox, see
// lib/email.ts). Throws if there is none, so a test fails loudly.
export function lastCodeSentTo(to: string): string {
  const email = sentEmails.findLast((e) => e.to === to);
  const code = email?.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`no code emailed to ${to}`);
  return code;
}
