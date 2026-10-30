import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.ts';

// Shared request-validation helpers. Replaced by Zod schemas in Phase 4.
// `unknown` (not `any`) forces a type check before using the value.
// `v is string` tells TypeScript: if this returns true, v is a string.

export function isValidName(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

// Trim before checking: the route trims before saving, so "  a@b.com "
// is valid input (z.email() alone rejects the spaces).
export function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && z.email().safeParse(v.trim()).success;
}

// Integer: the DB column is INTEGER, so 20.5 would make Postgres throw (500).
export function isValidDuration(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

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
