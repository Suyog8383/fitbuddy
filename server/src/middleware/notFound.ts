import type { Request, Response } from 'express';

// Catch-all for unknown routes.
// Express tries routes top to bottom. If nothing matched, the request
// "falls through" to here — so this must be added AFTER all routes.
// Without it, Express sends its default HTML "Cannot GET /x" page;
// an API should always answer in JSON.
export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}
