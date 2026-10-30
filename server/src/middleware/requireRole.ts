import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.ts';
import type { Role } from '../generated/prisma/client.ts';
import { ErrorCode, HttpError } from '../lib/http.ts';
import { authUser } from './requireAuth.ts';

// Authorization: "are you ALLOWED?" Runs after requireAuth ("who are you?").
// Usage: router.use(requireAuth, requireRole('ADMIN'))
//
// A factory: requireRole('ADMIN') returns a middleware set up for that role
// (a closure remembers `role`).
//
// The role is read from the DB on every request, not from the JWT: a demoted
// admin loses access immediately, not when their token expires.
// One small query (by primary key) — fine for rare admin requests.
export function requireRole(role: Role) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({
      where: { id: authUser(req).id },
      select: { role: true, disabledAt: true }, // only what we need
    });

    // No user (deleted), disabled, or wrong role -> 403: logged in, but no.
    // Not 401: the token is fine, and 401 would make the app log out.
    if (!user || user.disabledAt || user.role !== role) {
      throw new HttpError(403, ErrorCode.FORBIDDEN, 'Forbidden');
    }

    next();
  };
}
