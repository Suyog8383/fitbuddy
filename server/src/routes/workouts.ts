import { Router } from 'express';
import { prisma } from '../db.ts';
import {
  isForeignKeyViolation,
  isNotFound,
  isValidDuration,
  isValidId,
  isValidName,
} from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';

// Mounted in app.ts at '/api/v1/workouts'. The owner is the logged-in
// user, taken from the verified access token — never from the URL or body.
const router = Router();

// Every route below needs a valid access token (401 otherwise).
router.use(requireAuth);

const workoutNotFound = { error: 'Workout not found' };

// GET /workouts -> my workouts
router.get('/', async (req, res) => {
  const userId = authUser(req).id;

  // WHERE user_id = $1 — uses the @@index([userId]) from the schema.
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  res.json(workouts);
});

// GET /workouts/:id
router.get('/:id', async (req, res) => {
  const userId = authUser(req).id;
  const { id } = req.params;

  // The token says who you are; this filter checks the workout is yours.
  // `where: { id }` alone would let any logged-in user read any workout
  // by knowing its id (IDOR).
  const workout = isValidId(id)
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

// POST /workouts
router.post('/', async (req, res) => {
  const userId = authUser(req).id;

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

  try {
    const workout = await prisma.workout.create({
      data: { name: name.trim(), durationMin, userId },
    });
    res.status(201).json(workout);
  } catch (err) {
    // P2003: the token is valid, but its user was deleted after it was
    // issued (JWTs stay valid until exp). The identity is gone -> 401,
    // the client should log out.
    if (isForeignKeyViolation(err)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    throw err;
  }
});

// PATCH /workouts/:id
router.patch('/:id', async (req, res) => {
  const userId = authUser(req).id;
  const { id } = req.params;

  if (!isValidId(id)) {
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

// DELETE /workouts/:id
router.delete('/:id', async (req, res) => {
  const userId = authUser(req).id;
  const { id } = req.params;

  if (!isValidId(id)) {
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
