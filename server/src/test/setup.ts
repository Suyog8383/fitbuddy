import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../db.ts';

// Each test starts with empty tables -> tests can't affect each other.
// Children first, then parents (a workout can't exist without its user).
beforeEach(async () => {
  await prisma.workout.deleteMany();
  await prisma.user.deleteMany();
});

// Close the connection pool so the test run can exit.
afterAll(async () => {
  await prisma.$disconnect();
});
