import { Router } from 'express';
import { prisma } from '../db.ts';
import { ErrorCode, HttpError, parse } from '../lib/http.ts';
import { toWorkoutResponse } from '../lib/workoutResponse.ts';
import {
  isForeignKeyViolation,
  isNotFound,
  isValidId,
} from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';
import { CreateWorkoutBody, UpdateWorkoutBody } from '../schemas/workouts.ts';

// Mounted in app.ts at '/api/v1/workouts'. The owner is the logged-in
// user, taken from the verified access token — never from the URL or body.
const router = Router();

// Every route below needs a valid access token (401 otherwise).
router.use(requireAuth);

const notFound = () =>
  new HttpError(404, ErrorCode.WORKOUT_NOT_FOUND, 'Workout not found');

// Id columns are Postgres UUIDs: querying with 'abc' would make Postgres
// throw (500). Not a UUID = can't exist -> the same 404 as a missing row,
// not a 400 with details (a bad id is just "not found").
function workoutId(id: string): string {
  if (!isValidId(id)) throw notFound();
  return id;
}

// update/delete with no matching row (missing, or someone else's) -> P2025.
function rethrowNotFound(err: unknown): never {
  throw isNotFound(err) ? notFound() : err;
}

// GET /workouts -> my workouts
router.get('/', async (req, res) => {
  const userId = authUser(req).id;

  // WHERE user_id = $1 — uses the @@index([userId]) from the schema.
  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  res.json(workouts.map(toWorkoutResponse));
});

// GET /workouts/:id
router.get('/:id', async (req, res) => {
  const userId = authUser(req).id;
  const id = workoutId(req.params.id);

  // The token says who you are; this filter checks the workout is yours.
  // `where: { id }` alone would let any logged-in user read any workout
  // by knowing its id (IDOR).
  const workout = await prisma.workout.findFirst({ where: { id, userId } });

  // Same 404 whether the workout doesn't exist or belongs to someone
  // else — never reveal that another user's workout exists.
  if (!workout) throw notFound();

  res.json(toWorkoutResponse(workout));
});

// POST /workouts
router.post('/', async (req, res) => {
  const userId = authUser(req).id;
  // Typed + cleaned (name trimmed). A `userId` in the body is dropped.
  const body = parse(CreateWorkoutBody, req.body);

  const workout = await prisma.workout
    .create({ data: { ...body, userId } })
    .catch((err) => {
      // P2003: the token is valid, but its user was deleted after it was
      // issued (JWTs stay valid until exp). The identity is gone -> 401,
      // the client should log out.
      if (isForeignKeyViolation(err))
        throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Unauthorized');
      throw err;
    });

  res.status(201).json(toWorkoutResponse(workout));
});

// PATCH /workouts/:id
router.patch('/:id', async (req, res) => {
  const userId = authUser(req).id;
  const id = workoutId(req.params.id);
  // Parsed before any write: a bad field never leaves the workout
  // half-updated. Only sent fields are in `data` -> only those change.
  const data = parse(UpdateWorkoutBody, req.body);

  // One UPDATE ... WHERE id = $1 AND user_id = $2.
  const workout = await prisma.workout
    .update({ where: { id, userId }, data })
    .catch(rethrowNotFound);

  res.json(toWorkoutResponse(workout));
});

// DELETE /workouts/:id
router.delete('/:id', async (req, res) => {
  const userId = authUser(req).id;
  const id = workoutId(req.params.id);

  // Same pattern as PATCH: DELETE ... WHERE id AND owner; P2025 = no match.
  await prisma.workout.delete({ where: { id, userId } }).catch(rethrowNotFound);

  res.status(204).send(); // 204 = No Content
});

export default router;
