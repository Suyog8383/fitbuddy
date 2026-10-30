import type { Profile, User } from '../generated/prisma/client.ts';

// DTO = the exact user shape the API promises. An ALLOWLIST: only the
// fields listed here leave the server. New DB columns (internal ids,
// updatedAt, future secrets) stay hidden until someone adds them here.

type UserRow = Omit<User, 'passwordHash'> & { profile?: Profile | null };

// Date-only value -> "YYYY-MM-DD". Sending the full timestamp
// ("1995-04-12T00:00:00.000Z") makes apps west of UTC show the 11th.
const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

export function toUserResponse(user: UserRow) {
  const { profile } = user;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
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
