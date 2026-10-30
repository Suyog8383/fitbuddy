import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ErrorCode, HttpError } from '../lib/http.ts';

// Error handler: Express knows it's one because it has 4 params.
// Any error thrown in a route (or passed to next(err)) lands here.
// Must be added last in app.ts.
// Every error response has the same shape: { error, code, details? }
// error = human-readable message, code = what the app switches on.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Request didn't match its schema (parse() in a route).
  // Every bad field at once, so the app can mark them all in the form.
  // Only path + message — never the input value (could be a password).
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      code: ErrorCode.VALIDATION_FAILED,
      details: err.issues.map((issue) => ({
        // ['goal', 'target'] -> "goal.target". String(): Zod paths can
        // contain symbols, and join() would throw on those.
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Thrown on purpose by a route: status, code + message are safe to send.
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  // express.json() sets err.status = 400 on malformed JSON.
  // `err` is unknown, so narrow it before reading .status.
  const isBadJson =
    err instanceof Error && 'status' in err && err.status === 400;

  if (isBadJson) {
    res
      .status(400)
      .json({ error: 'Invalid JSON body', code: ErrorCode.INVALID_JSON });
    return;
  }

  // Unexpected error = a bug. Full details in our logs only;
  // the client gets a generic message (never err.message or the stack).
  // req.log (from pino-http) tags the line with this request's id.
  // Pass err as { err } so pino keeps the stack trace.
  req.log.error({ err }, 'unhandled error');
  res
    .status(500)
    .json({ error: 'Internal server error', code: ErrorCode.INTERNAL_ERROR });
}
