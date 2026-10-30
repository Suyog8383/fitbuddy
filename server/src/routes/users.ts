import { Router } from 'express';
import { prisma } from '../db.ts';
import { isNotFound } from '../lib/validation.ts';
import { authUser, requireAuth } from '../middleware/requireAuth.ts';

// Users are created by POST /auth/register (routes/auth.ts).
// "me" = the logged-in user from the access token. There's no
// /users/:userId: nobody can name another user's id here.
const router = Router();

router.use(requireAuth);

// A valid token whose user was deleted (JWTs stay valid until exp):
// the identity no longer exists -> 401, the client should log out.
const unauthorized = { error: 'Unauthorized' };

// GET /api/v1/users/me
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: authUser(req).id },
  });

  if (!user) {
    res.status(401).json(unauthorized);
    return;
  }

  res.json(user);
});

// DELETE /api/v1/users/me — account deletion (required by the app stores).
// onDelete: Cascade in the schema -> their workouts are deleted too.
router.delete('/me', async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: authUser(req).id } });
    res.status(204).send();
  } catch (err) {
    if (isNotFound(err)) {
      res.status(401).json(unauthorized);
      return;
    }
    throw err;
  }
});

export default router;
