import { Router } from 'express';
import { prisma } from '../db.ts';
import {
  isForeignKeyViolation,
  isNotFound,
  isValidDuration,
  isValidId,
  isValidName,
} from '../lib/validation.ts';

// Mounted in app.ts at '/api/v1/users/:userId/workouts', so '/' here is
// that path. mergeParams: true lets this router read the parent's :userId
// (by default a router only sees its own params).
//
// Temporary until Phase 3: the owner comes from the URL, which anyone can
// change. Phase 3 takes the user id from the login token instead.
const router = Router({ mergeParams: true });

// TS can't see :userId on its own (the parent route sets it), so we
// declare the params. `id` is optional: list/create routes have no :id.
type Params = { userId: string; id?: string };

const userNotFound = { error: 'User not found' };
const workoutNotFound = { error: 'Workout not found' };

// GET /users/:userId/workouts -> that user's workouts
router.get<Params>('/', async (req, res) => {
  const { userId } = req.params;

  if (!isValidId(userId)) {
    res.status(404).json(userNotFound);
    return;
  }

  // WHERE user_id = $1 — uses the @@index([userId]) from the schema.
  // Note: an unknown user returns [] (an empty list is a valid answer).
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  res.json(workouts);
});

// GET /users/:userId/workouts/:id
router.get<Params>('/:id', async (req, res) => {
  const { userId, id = '' } = req.params;

  // Filter by id AND owner. `where: { id }` alone would let any user read
  // any workout by knowing its id (IDOR).
  const workout =
    isValidId(userId) && isValidId(id)
      ? await prisma.workout.findFirst({ where: { id, userId } })
      : null;

  if (!workout) {
    // Same 404 whether the workout doesn't exist or belongs to someone
    // else — never reveal that another user's workout exists.
    res.status(404).json(workoutNotFound);
    return;
  }

  res.json(workout);
});

// POST /users/:userId/workouts
router.post<Params>('/', async (req, res) => {
  const { userId } = req.params;

  if (!isValidId(userId)) {
    res.status(404).json(userNotFound);
    return;
  }

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

  // No "does the user exist?" query first: the foreign key checks it.
  // Unknown user -> Postgres rejects the insert -> Prisma P2003.
  try {
    const workout = await prisma.workout.create({
      data: { name: name.trim(), durationMin, userId },
    });
    res.status(201).json(workout);
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      res.status(404).json(userNotFound);
      return;
    }
    throw err;
  }
});

// PATCH /users/:userId/workouts/:id
router.patch<Params>('/:id', async (req, res) => {
  const { userId, id = '' } = req.params;

  if (!isValidId(userId) || !isValidId(id)) {
    res.status(404).json(workoutNotFound);
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

  // One UPDATE ... WHERE id = $1 AND user_id = $2.
  // Prisma 5+ accepts extra filters next to the unique `id`.
  // No row matches (missing, or someone else's) -> P2025 -> 404.
  try {
    // Fields set to `undefined` are skipped -> only sent fields change.
    const workout = await prisma.workout.update({
      where: { id, userId },
      data: { name: name?.trim(), durationMin },
    });
    res.json(workout);
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json(workoutNotFound);
      return;
    }
    throw err; // anything else is a real bug -> errorHandler -> 500
  }
});

// DELETE /users/:userId/workouts/:id
router.delete<Params>('/:id', async (req, res) => {
  const { userId, id = '' } = req.params;

  if (!isValidId(userId) || !isValidId(id)) {
    res.status(404).json(workoutNotFound);
    return;
  }

  // Same pattern as PATCH: DELETE ... WHERE id AND owner; P2025 = no match.
  try {
    await prisma.workout.delete({ where: { id, userId } });
    res.status(204).send(); // 204 = No Content
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json(workoutNotFound);
      return;
    }
    throw err;
  }
});

export default router;
