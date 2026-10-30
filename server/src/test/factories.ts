import bcrypt from 'bcrypt';
import { prisma } from '../db.ts';

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
