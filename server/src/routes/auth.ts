import { Router } from 'express';
import { prisma } from '../db.ts';
import {
  DUMMY_HASH,
  hashPassword,
  isValidPassword,
  verifyPassword,
} from '../lib/password.ts';
import {
  isUniqueViolation,
  isValidEmail,
  isValidName,
} from '../lib/validation.ts';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  const { email, name, password } = req.body ?? {};

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'email must be a valid email address' });
    return;
  }
  if (!isValidName(name)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (!isValidPassword(password)) {
    res.status(400).json({
      error: 'password must be at least 8 characters and at most 72 bytes',
    });
    return;
  }

  // Note: no trim on the password — spaces are valid characters in it.
  const passwordHash = await hashPassword(password);

  // Let the UNIQUE constraint catch duplicate emails (P2002), no check first.
  try {
    // The returned user has no passwordHash (omitted by default, db.ts).
    const user = await prisma.user.create({
      data: {
        // Lowercase: "Suyog@Mail.com" and "suyog@mail.com" are one inbox.
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash,
      },
    });
    res.status(201).json(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Reveals that the email is registered (enumeration) — accepted
      // for now; 3D (email verification) can hide it.
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    throw err;
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  // Only check the shape here. No length rules: a login must accept
  // whatever was valid at register time, even if the rules change later.
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  // The one place that asks for the hidden hash.
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    omit: { passwordHash: false },
  });

  // ALWAYS run bcrypt, even with no user — skipping it would answer
  // in ~2 ms instead of ~250 ms and reveal the email isn't registered.
  const passwordOk = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (!user || !passwordOk) {
    // One message for both cases: never say which part was wrong.
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // We asked for the hash, so strip it ourselves before responding.
  const { passwordHash, ...safeUser } = user;
  // 3B: respond with an access token here instead.
  res.json(safeUser);
});

export default router;
