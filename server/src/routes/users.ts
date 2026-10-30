import { Router } from 'express';
import { prisma } from '../db.ts';
import { HttpError, parse } from '../lib/http.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { issueRefreshToken } from '../lib/refreshTokens.ts';
import { signAccessToken } from '../lib/tokens.ts';
import { toUserResponse } from '../lib/userResponse.ts';
import { isNotFound } from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';
import { ChangePasswordBody, UpdateMeBody } from '../schemas/users.ts';

// Users are created by POST /auth/register (routes/auth.ts).
// "me" = the logged-in user from the access token. There's no
// /users/:userId: nobody can name another user's id here.
const router = Router();

router.use(requireAuth);

// A valid token whose user was deleted (JWTs stay valid until exp):
// the identity no longer exists -> 401, the client should log out.
const unauthorized = () => new HttpError(401, 'Unauthorized');

// GET /api/v1/users/me -> user + profile (null if never filled in)
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: authUser(req).id },
    include: { profile: true }, // JOIN profiles in the same query
  });

  if (!user) throw unauthorized();

  res.json(toUserResponse(user));
});

// PATCH /api/v1/users/me — name and/or profile fields, only those sent.
router.patch('/me', async (req, res) => {
  // `name` belongs to users, the rest to profiles.
  const { name, ...profile } = parse(UpdateMeBody, req.body);
  const hasProfileFields = Object.keys(profile).length > 0;

  // Nested write: users + profiles in ONE transaction (Prisma wraps it).
  // upsert = the profile may not exist yet: create it, or update it.
  // Absent keys aren't in `profile` -> those columns are left alone;
  // null values clear their column.
  const user = await prisma.user
    .update({
      where: { id: authUser(req).id },
      data: {
        name,
        profile: hasProfileFields
          ? { upsert: { create: profile, update: profile } }
          : undefined,
      },
      include: { profile: true },
    })
    .catch((err) => {
      throw isNotFound(err) ? unauthorized() : err;
    });

  res.json(toUserResponse(user));
});

// POST /api/v1/users/me/password   body: { currentPassword, newPassword }
// Re-authentication: a valid token only proves "this device is logged in"
// (could be an unlocked phone on a table). Changing the password also
// needs the current one.
router.post('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = parse(ChangePasswordBody, req.body);

  const user = await prisma.user.findUnique({
    where: { id: authUser(req).id },
    omit: { passwordHash: false }, // the one thing we need here
  });
  if (!user) throw unauthorized();

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    // 400, NOT 401: the app treats 401 as "session expired" and logs the
    // user out. A typo in the current password must not do that.
    throw new HttpError(400, 'Current password is incorrect');
  }

  // bcrypt (~250 ms) outside the transaction: keep transactions short.
  const passwordHash = await hashPassword(newPassword);

  // New password + every session revoked, or neither.
  // An access token only carries `sub`, not the refresh family, so we
  // can't spare "this device" — revoke all, then log this device back in.
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  // Fresh pair for THIS device (new family). Other devices are logged out.
  const accessToken = await signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);
  res.json({ accessToken, refreshToken });
});

// DELETE /api/v1/users/me — account deletion (required by the app stores).
// onDelete: Cascade in the schema -> profile, workouts, tokens and codes
// are deleted too. Really deleted, not "deactivated".
router.delete('/me', async (req, res) => {
  await prisma.user.delete({ where: { id: authUser(req).id } }).catch((err) => {
    throw isNotFound(err) ? unauthorized() : err;
  });

  res.status(204).send();
});

export default router;
