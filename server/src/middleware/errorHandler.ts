import type { NextFunction, Request, Response } from 'express';

// Error handler: Express knows it's one because it has 4 params.
// Any error thrown in a route (or passed to next(err)) lands here.
// Must be added last in app.ts.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // express.json() sets err.status = 400 on malformed JSON.
  // `err` is unknown, so narrow it before reading .status.
  const isBadJson =
    err instanceof Error && 'status' in err && err.status === 400;

  if (isBadJson) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  // Unexpected error = a bug. Full details in our logs only;
  // the client gets a generic message (never err.message or the stack).
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
