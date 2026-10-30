import { z } from 'zod';
import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { ErrorCode } from '../lib/http.ts';
import { WorkoutResponse } from '../schemas/responses.ts';
import { CreateWorkoutBody, UpdateWorkoutBody } from '../schemas/workouts.ts';
import {
  bearer,
  error,
  errorCase,
  idParam,
  json,
  jsonBody,
  noContent,
  unauthorized,
  validationError,
} from './helpers.ts';

// Docs for routes/workouts.ts. Always the caller's own workouts.

const tags = ['Workouts'];
// Missing, not a UUID, or someone else's — never says which.
const notFound = error(
  'No such workout, or it belongs to someone else (never says which)',
  errorCase(ErrorCode.WORKOUT_NOT_FOUND, 'Workout not found'),
);

export const workoutsPaths: ZodOpenApiPathsObject = {
  '/api/v1/workouts': {
    get: {
      tags,
      summary: 'My workouts, newest first',
      security: bearer,
      responses: {
        200: json('List', z.array(WorkoutResponse)),
        401: unauthorized,
      },
    },
    post: {
      tags,
      summary: 'Create a workout',
      security: bearer,
      requestBody: jsonBody(CreateWorkoutBody),
      responses: {
        201: json('Created', WorkoutResponse),
        400: validationError,
        401: unauthorized,
      },
    },
  },
  '/api/v1/workouts/{id}': {
    get: {
      tags,
      summary: 'One of my workouts',
      security: bearer,
      requestParams: idParam,
      responses: {
        200: json('Workout', WorkoutResponse),
        401: unauthorized,
        404: notFound,
      },
    },
    patch: {
      tags,
      summary: 'Update a workout (only sent fields)',
      security: bearer,
      requestParams: idParam,
      requestBody: jsonBody(UpdateWorkoutBody),
      responses: {
        200: json('Updated', WorkoutResponse),
        400: validationError,
        401: unauthorized,
        404: notFound,
      },
    },
    delete: {
      tags,
      summary: 'Delete a workout',
      security: bearer,
      requestParams: idParam,
      responses: { 204: noContent, 401: unauthorized, 404: notFound },
    },
  },
};
