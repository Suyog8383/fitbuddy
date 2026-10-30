import { Router } from 'express';
import { prisma } from '../db.ts';
import {
  isNotFound,
  isUniqueViolation,
  isValidEmail,
  isValidId,
  isValidName,
} from '../lib/validation.ts';

// Temporary until Phase 3 (auth): users are created with just email + name,
// and the user id travels in the URL. Phase 3 adds passwords + tokens.

const router = Router();

// POST /api/v1/users
router.post('/', async (req, res) => {
  const { email, name } = req.body ?? {};

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }
  if (!isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }

  // Don't check "does this email exist?" first — two requests could both
  // pass the check. Let the UNIQUE constraint decide, and catch P2002.
  try {
    const user = await prisma.user.create({
      // Lowercase: "Suyog@Mail.com" and "suyog@mail.com" are the same inbox.
      data: { email: email.trim().toLowerCase(), name: name.trim() },
    });
    res.status(201).json(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // 409 Conflict = request is valid, but clashes with existing data.
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    throw err;
  }
});

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
