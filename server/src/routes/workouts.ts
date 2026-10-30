import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.ts';
import { Prisma } from '../generated/prisma/client.ts';

// Validation helpers, shared by POST and PATCH.
// `unknown` (not `any`) forces us to check the type before using the value.
// `v is string` tells TypeScript: if this returns true, v is a string.
// Replaced by Zod request validation in Phase 4.
function isValidName(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

// Integer now: the DB column is INTEGER, so 20.5 would make Postgres throw (500).
function isValidDuration(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// The id column is a Postgres UUID. Querying with 'abc' makes Postgres throw
// "invalid input syntax for type uuid" -> 500. Check first; not a UUID = can't exist.
function isValidId(v: string): boolean {
  return z.uuid().safeParse(v).success;
}

// Prisma throws P2025 when update/delete finds no row to change.
function isNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
  );
}

// A Router is a mini-app. Paths here are relative to where it's mounted
// in app.ts ('/api/v1/workouts'), so '/' here = '/api/v1/workouts'.
const router = Router();

// GET /api/v1/workouts -> list all
// `async` + `await`: the DB is over the network, every query is a Promise.
// If it throws, Express 5 passes the error to errorHandler (-> 500).
router.get('/', async (_req, res) => {
  // SELECT * FROM workouts ORDER BY created_at DESC, id DESC
  // (id = tie-breaker when two rows have the same created_at)
  const workouts = await prisma.workout.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  // res.json() sets Content-Type: application/json. Status defaults to 200.
  res.json(workouts);
});

// GET /api/v1/workouts/:id -> one workout
// ':id' is a route param. /workouts/abc -> req.params.id === 'abc'
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  // SELECT * FROM workouts WHERE id = $1 — returns null if no row.
  const workout = isValidId(id)
    ? await prisma.workout.findUnique({ where: { id } })
    : null;

  if (!workout) {
    // 404 = the resource doesn't exist.
    // `return` stops the handler, so we never send two responses.
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  res.json(workout);
});

// POST /
router.post('/', async (req, res) => {
  // Express 5: req.body is undefined when no JSON body is sent.
  const { name, durationMin } = req.body ?? {};

  if (!isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (!isValidDuration(durationMin)) {
    res.status(400).json({ error: 'durationMin must be a positive integer' });
    return;
  }

  // INSERT INTO workouts (...) VALUES (...) RETURNING *
  // Prisma fills id (@default(uuid())) and createdAt (@default(now())).
  const workout = await prisma.workout.create({
    data: { name: name.trim(), durationMin },
  });

  res.status(201).json(workout);
});

// PATCH /:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  const { name, durationMin } = req.body ?? {};

  // Validate everything first, then write once — a bad field never
  // leaves the workout half-updated.
  // `!== undefined` = "field was sent". Sent but invalid -> 400.
  if (name !== undefined && !isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (durationMin !== undefined && !isValidDuration(durationMin)) {
    res.status(400).json({ error: 'durationMin must be a positive integer' });
    return;
  }

  // No findUnique first: that would be 2 queries, and the row could be
  // deleted between them. One UPDATE — if no row matches, Prisma throws P2025.
  try {
    // UPDATE workouts SET ... WHERE id = $1 RETURNING *
    // Fields set to `undefined` are skipped -> only sent fields change.
    const workout = await prisma.workout.update({
      where: { id },
      data: { name: name?.trim(), durationMin },
    });
    res.json(workout);
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    throw err; // anything else is a real bug -> errorHandler -> 500
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  // Same pattern as PATCH: one DELETE, P2025 = nothing to delete.
  try {
    await prisma.workout.delete({ where: { id } });
    res.status(204).send(); // 204 = No Content
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    throw err;
  }
});

export default router;
