import { z } from 'zod';
import { Name } from './common.ts';

export const CreateWorkoutBody = z
  .object({
    name: Name,
    // JSON body -> real numbers, so no coerce: "30" is a 400, not 30.
    // int(): the DB column is INTEGER, 20.5 would make Postgres throw (500).
    durationMin: z.number().int().positive(),
  })
  .meta({
    id: 'CreateWorkoutBody',
    example: { name: 'Morning run', durationMin: 30 },
  });

// PATCH: same fields, all optional. Only sent fields are in the output,
// so only those get updated. Unknown keys (userId!) are dropped.
// .partial() makes a NEW schema: it doesn't inherit CreateWorkoutBody's id.
export const UpdateWorkoutBody = CreateWorkoutBody.partial().meta({
  id: 'UpdateWorkoutBody',
  example: { durationMin: 45 },
});
