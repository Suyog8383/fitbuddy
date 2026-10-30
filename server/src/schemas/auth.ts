import { z } from 'zod';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARS } from '../lib/password.ts';
import { Name } from './common.ts';

// Request schemas: one place that describes what each endpoint accepts.
// z.object drops unknown keys -> a body with { emailVerifiedAt, passwordHash }
// can never reach the database (mass assignment).
// Phase 4D generates the API docs from these same schemas.

// Trim + lowercase FIRST, then check the format: "  Suyog@Mail.com "
// is accepted and becomes "suyog@mail.com" (one inbox, one account).
// .pipe() = run the next schema on the cleaned value.
export const Email = z.string().trim().toLowerCase().pipe(z.email());

// A string, not a number: "000042" keeps its leading zeros.
export const Code = z.string().regex(/^\d{6}$/, 'must be 6 digits');

// No trim: spaces are valid password characters.
// Bytes, not characters: bcrypt ignores everything after 72 bytes.
export const Password = z
  .string()
  .min(PASSWORD_MIN_CHARS, `must be at least ${PASSWORD_MIN_CHARS} characters`)
  .refine((p) => Buffer.byteLength(p, 'utf8') <= PASSWORD_MAX_BYTES, {
    message: `must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

export const RegisterBody = z.object({
  email: Email,
  name: Name,
  password: Password,
});

// Shape only, no rules: login must accept whatever was valid at register
// time, even if the rules change later. Wrong values -> one generic 401.
export const LoginBody = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

// /refresh and /logout. Only "is it a non-empty string" — whether the token
// is real is the DB's job, with one generic answer.
export const RefreshBody = z.object({
  refreshToken: z.string().min(1),
});

export const VerifyEmailBody = z.object({ code: Code });

export const ForgotPasswordBody = z.object({ email: Email });

// Same Password rules as register: a reset can't set a weaker password.
export const ResetPasswordBody = z.object({
  email: Email,
  code: Code,
  newPassword: Password,
});
