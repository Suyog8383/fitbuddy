import type { z } from 'zod';
import type { Profile, User } from '../generated/prisma/client.ts';
import type { AdminUserResponse, UserResponse } from '../schemas/responses.ts';

// DTO = the exact user shape the API promises. An ALLOWLIST: only the
// fields listed here leave the server. New DB columns (internal ids,
// updatedAt, future secrets) stay hidden until someone adds them here.
//
// The return type comes from the documented response schema: add a field
// here but not there (or the other way round) -> TypeScript error.
// Docs and code can't drift.

type UserRow = Omit<User, 'passwordHash'> & { profile?: Profile | null };

// Date-only value -> "YYYY-MM-DD". Sending the full timestamp
// ("1995-04-12T00:00:00.000Z") makes apps west of UTC show the 11th.
const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

// Timestamps as ISO strings here (not Date objects), so the value matches
// the schema exactly — res.json would do the same conversion anyway.
export function toUserResponse(user: UserRow): z.infer<typeof UserResponse> {
  const { profile } = user;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    // The app shows admin screens for ADMIN. That's UX only — the API
    // checks the role itself (requireRole).
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    // null until the first profile PATCH -> app shows onboarding.
    profile: profile
      ? {
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          birthDate: profile.birthDate && toDateOnly(profile.birthDate),
          goal: profile.goal,
          units: profile.units,
        }
      : null,
  };
}

// What an admin sees about any user. Account info only — NO profile or
// health data: support work doesn't need someone's weight.
export function toAdminUserResponse(
  user: Omit<User, 'passwordHash'>,
): z.infer<typeof AdminUserResponse> {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
