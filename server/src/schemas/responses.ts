import { z } from 'zod';
import { ErrorCode } from '../lib/http.ts';
import { FitnessGoal, Role, UnitSystem } from '../generated/prisma/client.ts';

// Response schemas = what the API SENDS (request schemas = what it accepts).
// Separate because request schemas transform data (birthDate string -> Date)
// and a transform can't be documented as output.
//
// strictObject: extra keys are an error, not silently dropped. Contract
// tests parse real responses with these — a field leaking out of a DTO
// (passwordHash!) fails the test. Docs also say "no other fields".
//
// .meta({ id }) = becomes a named, reusable component in the OpenAPI doc.
// `example` values are fake on purpose: docs get shared and screenshotted,
// so never a real email, name or token.

// Every error, from errorHandler. `details` only on validation errors.
export const ErrorResponse = z
  .strictObject({
    error: z.string().meta({ description: 'Human-readable; may change' }),
    code: z.enum(ErrorCode).meta({
      description: 'Stable: switch on this in the app, not on `error`',
    }),
    details: z
      .array(z.strictObject({ path: z.string(), message: z.string() }))
      .optional(),
  })
  .meta({ id: 'Error' });

export const ProfileResponse = z
  .strictObject({
    heightCm: z.number().int().nullable(),
    weightKg: z.number().nullable(),
    birthDate: z.iso.date().nullable().meta({ example: '1995-04-12' }),
    goal: z.enum(FitnessGoal).nullable(),
    units: z.enum(UnitSystem),
  })
  .meta({
    id: 'Profile',
    example: {
      heightCm: 178,
      weightKg: 72.5,
      birthDate: '1995-04-12',
      goal: 'BUILD_MUSCLE',
      units: 'METRIC',
    },
  });

export const UserResponse = z
  .strictObject({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    emailVerifiedAt: z.iso.datetime().nullable(),
    role: z.enum(Role),
    createdAt: z.iso.datetime(),
    profile: ProfileResponse.nullable(),
  })
  .meta({
    id: 'User',
    example: {
      id: '7b0c1f9e-3c1a-4f2e-9d55-2a6f1c8e4b10',
      email: 'suyog@example.com',
      name: 'Suyog',
      emailVerifiedAt: '2026-10-30T09:35:02.650Z',
      role: 'USER',
      createdAt: '2026-10-30T09:30:00.000Z',
      profile: null,
    },
  });

export const TokenPairResponse = z
  .strictObject({
    accessToken: z.string().meta({ description: 'JWT, 15 minutes' }),
    refreshToken: z
      .string()
      .meta({ description: 'Opaque, 30 days, single use' }),
  })
  .meta({
    id: 'TokenPair',
    example: {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.example.signature',
      refreshToken: 'q3Zt8m1V0bWJpY2Fs-example-refresh-token',
    },
  });

export const LoginResponse = z
  .strictObject({
    user: UserResponse,
    ...TokenPairResponse.shape,
  })
  .meta({ id: 'LoginResponse' });

export const WorkoutResponse = z
  .strictObject({
    id: z.uuid(),
    name: z.string(),
    durationMin: z.number().int(),
    createdAt: z.iso.datetime(),
    userId: z.uuid(),
  })
  .meta({
    id: 'Workout',
    example: {
      id: 'c2d5e8a1-6b3f-4d7c-8e9a-1f2b3c4d5e6f',
      name: 'Morning run',
      durationMin: 30,
      createdAt: '2026-10-30T07:15:00.000Z',
      userId: '7b0c1f9e-3c1a-4f2e-9d55-2a6f1c8e4b10',
    },
  });

// Account fields only — no profile / health data for admins.
export const AdminUserResponse = z
  .strictObject({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    role: z.enum(Role),
    emailVerifiedAt: z.iso.datetime().nullable(),
    disabledAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: 'AdminUser',
    example: {
      id: '7b0c1f9e-3c1a-4f2e-9d55-2a6f1c8e4b10',
      email: 'suyog@example.com',
      name: 'Suyog',
      role: 'USER',
      emailVerifiedAt: '2026-10-30T09:35:02.650Z',
      disabledAt: null,
      createdAt: '2026-10-30T09:30:00.000Z',
    },
  });

export const StatsResponse = z
  .strictObject({
    users: z.number().int(),
    workouts: z.number().int(),
    newUsersLast7Days: z.number().int(),
  })
  .meta({
    id: 'Stats',
    example: { users: 1280, workouts: 15342, newUsersLast7Days: 64 },
  });

export const HealthResponse = z
  .strictObject({ status: z.literal('ok') })
  .meta({ id: 'Health' });
