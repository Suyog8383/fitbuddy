import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../db.ts';
import { sentEmails } from '../lib/email.ts';

// Each test starts with empty tables -> tests can't affect each other.
// Children first, then parents (a workout can't exist without its user).
beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.emailCode.deleteMany();
  await prisma.workout.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  sentEmails.length = 0; // empty the test inbox (same array, now empty)
});

// Close the connection pool so the test run can exit.
afterAll(async () => {
  await prisma.$disconnect();
});
