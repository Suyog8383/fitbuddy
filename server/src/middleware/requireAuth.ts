import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/tokens.ts';

// Protects a route: only requests with a valid access token get through.
// Usage: router.get('/', requireAuth, handler)  or  router.use(requireAuth)
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Expected header: "Authorization: Bearer <token>"
  // (the scheme name is case-insensitive per the HTTP spec).
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];

  let userId: string;
  try {
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new Error('missing or malformed Authorization header');
    }
    userId = await verifyAccessToken(token);
  } catch (err) {
    // Detail (expired? bad signature?) goes to our logs only. The client
    // gets one generic answer — no hints for an attacker.
    req.log.debug({ err }, 'unauthenticated request');
    // Standard header telling the client which auth scheme to use.
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // From here on, routes trust req.user — it came from a verified token,
  // not from anything the client typed (URL, body).
  req.user = { id: userId };
  next();
}

// For routes behind requireAuth: returns the user, typed as present.
// If it's missing, the route forgot requireAuth — a bug in OUR code,
// so throw (-> 500) instead of quietly treating the request as anonymous.
export function authUser(req: Request): { id: string } {
  if (!req.user) {
    throw new Error('authUser() called on a route without requireAuth');
  }
  return req.user;
}
