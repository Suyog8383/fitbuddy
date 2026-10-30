import { Router } from 'express';

type Workout = {
  id: string;
  name: string;
  durationMin: number;
  createdAt: string;
};

// In-memory "database": just an array. Resets on every restart.
// Replaced by Postgres in Phase 2.
const workouts: Workout[] = [
  {
    id: crypto.randomUUID(),
    name: 'Morning run',
    durationMin: 30,
    createdAt: new Date().toISOString(),
  },
];

// Validation helpers, shared by POST and PATCH.
// `unknown` (not `any`) forces us to check the type before using the value.
// `v is string` tells TypeScript: if this returns true, v is a string.
// Replaced by Zod in Part B.
function isValidName(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function isValidDuration(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

// A Router is a mini-app. Paths here are relative to where it's mounted
// in app.ts ('/api/v1/workouts'), so '/' here = '/api/v1/workouts'.
const router = Router();

// GET /api/v1/workouts -> list all
router.get('/', (_req, res) => {
  // res.json() sets Content-Type: application/json. Status defaults to 200.
  res.json(workouts);
});

// GET /api/v1/workouts/:id -> one workout
// ':id' is a route param. /workouts/abc -> req.params.id === 'abc'
router.get('/:id', (req, res) => {
  const workout = workouts.find((w) => w.id === req.params.id);

  if (!workout) {
    // 404 = the resource doesn't exist.
    // `return` stops the handler, so we never send two responses.
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  res.json(workout);
});

// POST /
router.post('/', (req, res) => {
  // Express 5: req.body is undefined when no JSON body is sent.
  const { name, durationMin } = req.body ?? {};

  if (!isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (!isValidDuration(durationMin)) {
    res.status(400).json({ error: 'durationMin must be a positive number' });
    return;
  }

  const newWorkout: Workout = {
    id: crypto.randomUUID(),
    name: name.trim(),
    durationMin,
    createdAt: new Date().toISOString(),
  };

  workouts.push(newWorkout);
  res.status(201).json(newWorkout);
});

// PATCH /:id
router.patch('/:id', (req, res) => {
  const workout = workouts.find((w) => w.id === req.params.id);

  if (!workout) {
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  const { name, durationMin } = req.body ?? {};

  // Validate everything first, then apply — so a bad field never
  // leaves the workout half-updated.
  // `!== undefined` = "field was sent". Sent but invalid -> 400.
  if (name !== undefined && !isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (durationMin !== undefined && !isValidDuration(durationMin)) {
    res.status(400).json({ error: 'durationMin must be a positive number' });
    return;
  }

  if (name !== undefined) workout.name = name.trim();
  if (durationMin !== undefined) workout.durationMin = durationMin;

  res.json(workout);
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const index = workouts.findIndex((w) => w.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ error: 'Workout not found' });
    return;
  }

  workouts.splice(index, 1);
  res.status(204).send(); // 204 = No Content
});

export default router;
