import type { z } from 'zod';

// Routes THROW errors that say what went wrong; errorHandler (one place)
// turns them into responses. No more `res.status(...).json(...); return;`.

// Machine-readable error codes: the app `switch`es on these, never on the
// message text (which can be reworded any time). One list, used by the
// routes AND documented as an enum in OpenAPI. Adding a code is fine;
// renaming or removing one breaks app versions already in the store.
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_JSON: 'INVALID_JSON',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  INVALID_CODE: 'INVALID_CODE',
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  CANNOT_CHANGE_OWN_ACCOUNT: 'CANNOT_CHANGE_OWN_ACCOUNT',
  WORKOUT_NOT_FOUND: 'WORKOUT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// An error that's meant for the client: status, code and message are sent
// as-is. Any OTHER error is treated as a bug -> generic 500.
export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  // No `constructor(public status: number)` shorthand: parameter
  // properties aren't erasable, so Node's type stripping rejects them.
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

// Parse, don't validate: returns NEW typed, cleaned data (trimmed,
// unknown keys dropped). Invalid -> throws ZodError -> errorHandler -> 400.
// `?? {}`: Express 5 leaves req.body undefined when no body is sent; an
// empty object makes Zod list each missing field instead of
// "expected object, received undefined".
export function parse<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.output<T> {
  return schema.parse(data ?? {});
}
