import type { z } from 'zod';
import type { Workout } from '../generated/prisma/client.ts';
import type { WorkoutResponse } from '../schemas/responses.ts';

// Allowlist DTO, tied to the documented schema (same idea as userResponse.ts).
// Today it's every column; a future internal column stays hidden until
// it's added here AND to the schema.
export function toWorkoutResponse(
  workout: Workout,
): z.infer<typeof WorkoutResponse> {
  return {
    id: workout.id,
    name: workout.name,
    durationMin: workout.durationMin,
    createdAt: workout.createdAt.toISOString(),
    userId: workout.userId,
  };
}
