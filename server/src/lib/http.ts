import type { z } from 'zod';

// Routes THROW errors that say what went wrong; errorHandler (one place)
// turns them into responses. No more `res.status(...).json(...); return;`.

// An error that's meant for the client: its status and message are sent
// as-is. Any OTHER error is treated as a bug -> generic 500.
export class HttpError extends Error {
  readonly status: number;

  // No `constructor(public status: number)` shorthand: parameter
  // properties aren't erasable, so Node's type stripping rejects them.
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
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
