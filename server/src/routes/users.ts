import { Router } from 'express';
import { prisma } from '../db.ts';
import { HttpError } from '../lib/http.ts';
import { isNotFound } from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';

// Users are created by POST /auth/register (routes/auth.ts).
// "me" = the logged-in user from the access token. There's no
// /users/:userId: nobody can name another user's id here.
const router = Router();

router.use(requireAuth);

// A valid token whose user was deleted (JWTs stay valid until exp):
// the identity no longer exists -> 401, the client should log out.
const unauthorized = () => new HttpError(401, 'Unauthorized');

// GET /api/v1/users/me
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: authUser(req).id },
  });

  if (!user) throw unauthorized();

  res.json(user);
});

// DELETE /api/v1/users/me — account deletion (required by the app stores).
// onDelete: Cascade in the schema -> their workouts are deleted too.
router.delete('/me', async (req, res) => {
  await prisma.user.delete({ where: { id: authUser(req).id } }).catch((err) => {
    throw isNotFound(err) ? unauthorized() : err;
  });

  res.status(204).send();
});

export default router;
