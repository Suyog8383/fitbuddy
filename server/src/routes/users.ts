import { Router } from 'express';
import { prisma } from '../db.ts';
import { isNotFound, isValidId } from '../lib/validation.ts';

// Users are created by POST /auth/register (routes/auth.ts).
// Temporary until 3B: the user id travels in the URL — anyone can change
// it. 3B replaces this with /users/me, using the id from the login token.

const router = Router();

// GET /api/v1/users/:userId
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  const user = isValidId(userId)
    ? await prisma.user.findUnique({ where: { id: userId } })
    : null;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

// DELETE /api/v1/users/:userId
// onDelete: Cascade in the schema -> their workouts are deleted too.
router.delete('/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!isValidId(userId)) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    res.status(204).send();
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    throw err;
  }
});

export default router;
