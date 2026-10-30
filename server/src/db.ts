import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import { env } from './env.ts';

// Prisma 7 talks to Postgres through the standard `pg` driver via an adapter.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// ONE client for the whole app. Each PrismaClient opens a connection pool;
// creating one per request would exhaust Postgres's connection limit.
// Import this everywhere: `import { prisma } from '../db.ts'`
export const prisma = new PrismaClient({ adapter });
