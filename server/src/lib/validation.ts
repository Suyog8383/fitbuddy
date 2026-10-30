import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.ts';

// Request bodies are checked by Zod schemas (src/schemas/). What's left
// here: the id check (a bad id is a 404, not a 400) and Prisma error codes.

// Id columns are Postgres UUIDs. Querying with 'abc' makes Postgres throw
// "invalid input syntax for type uuid" -> 500. Not a UUID = can't exist.
export function isValidId(v: string): boolean {
  return z.uuid().safeParse(v).success;
}

// --- Prisma error codes ---

function isPrismaError(err: unknown, code: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
  );
}

// P2025: update/delete found no row to change.
export function isNotFound(err: unknown): boolean {
  return isPrismaError(err, 'P2025');
}

// P2003: a foreign key points to a row that doesn't exist
// (e.g. creating a workout for a user id with no user).
export function isForeignKeyViolation(err: unknown): boolean {
  return isPrismaError(err, 'P2003');
}

// P2002: a @unique constraint was violated (e.g. duplicate email).
export function isUniqueViolation(err: unknown): boolean {
  return isPrismaError(err, 'P2002');
}
