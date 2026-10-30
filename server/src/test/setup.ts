import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../db.ts';

// Each test starts with empty tables -> tests can't affect each other.
beforeEach(async () => {
  await prisma.workout.deleteMany();
});

// Close the connection pool so the test run can exit.
afterAll(async () => {
  await prisma.$disconnect();
});
