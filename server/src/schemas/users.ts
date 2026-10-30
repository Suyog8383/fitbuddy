import { z } from 'zod';
import { FitnessGoal, Role, UnitSystem } from '../generated/prisma/client.ts';
import { Password } from './auth.ts';
import { Name } from './common.ts';

export const MIN_AGE = 13;

// "YYYY-MM-DD" for the day `years` ago (UTC). Date-only strings compare
// correctly as plain strings: "1995-04-12" < "2013-10-30".
function dayYearsAgo(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

// Calendar date in, Date out. z.iso.date() accepts only "YYYY-MM-DD" —
// no time, no timezone. new Date("1995-04-12") = midnight UTC, which a
// Postgres DATE column stores as exactly 1995-04-12.
const BirthDate = z.iso
  .date()
  .refine((d) => d >= '1900-01-01', 'must be after 1900')
  .refine(
    (d) => d <= dayYearsAgo(MIN_AGE),
    `must be at least ${MIN_AGE} years ago`,
  )
  .transform((d) => new Date(d))
  // Docs show the INPUT ("YYYY-MM-DD" string); refines aren't expressible.
  .meta({
    description: `Calendar date, YYYY-MM-DD. At least ${MIN_AGE} years ago.`,
    example: '1995-04-12',
  });

// PATCH /users/me — flat body, every field optional.
// Three states for nullable fields:
//   key absent -> don't change   (.optional())
//   null       -> clear it       (.nullable())
//   value      -> set it
export const UpdateMeBody = z
  .object({
    name: Name.optional(), // required column: can change, can't be cleared
    // Ranges catch typos: 725 instead of 72.5 is a 400, not a saved weight.
    heightCm: z.number().int().min(50).max(300).nullable().optional(),
    weightKg: z
      .number()
      .min(20)
      .max(500)
      .transform((kg) => Math.round(kg * 10) / 10) // 72.46 -> 72.5
      .nullable()
      .optional(),
    birthDate: BirthDate.nullable().optional(),
    // z.enum accepts the generated Prisma enum object -> one source of truth.
    goal: z.enum(FitnessGoal).nullable().optional(),
    units: z.enum(UnitSystem).optional(), // has a default, can't be null
  })
  .meta({
    id: 'UpdateMeBody',
    example: {
      heightCm: 178,
      weightKg: 72.5,
      birthDate: '1995-04-12',
      goal: 'BUILD_MUSCLE',
      units: 'METRIC',
    },
  });

// POST /users/me/password
export const ChangePasswordBody = z
  .object({
    // Shape only, like login: it must match whatever was valid back then.
    currentPassword: z.string(),
    // Same rules as register and reset.
    newPassword: Password,
  })
  .meta({
    id: 'ChangePasswordBody',
    example: {
      currentPassword: 'correct horse battery',
      newPassword: 'a brand new password',
    },
  });

// GET /admin/users?email=... — query values are always strings (or arrays
// for ?email=a&email=b, which fails here -> 400).
export const AdminUsersQuery = z.object({
  email: z.string().trim().min(1).optional(),
});

// PATCH /admin/users/:id — only these two things, nothing else about a user.
export const AdminUpdateUserBody = z
  .object({
    role: z.enum(Role).optional(),
    disabled: z.boolean().optional(),
  })
  .meta({
    id: 'AdminUpdateUserBody',
    example: { disabled: true },
  });
